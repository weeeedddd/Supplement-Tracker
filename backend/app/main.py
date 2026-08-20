"""◈ SHADOW~1 Backend — FastAPI

Start:  uvicorn app.main:app --host 0.0.0.0 --port 8000
Env:    DATABASE_URL   (default sqlite:///./shadow.db)
        CORS_ORIGINS   (kommagetrennte, exakte Origins; kein Wildcard)
        MEDIA_DIR      (default ./media)

Liefert: Auth, Scan-Historie, Live-Marktpreise (Open Prices Proxy),
Food-Analyse (Open Food Facts Proxy), Community-Chat (WebSocket) mit
Shadow-Bot-Moderation und Media-Upload.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import time

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .api_v1 import router as api_v1_router
from .guild_api import router as guild_router
from .push_api import router as push_router
from .social_api import router as social_router
from .db import Base, SessionLocal, engine, get_db
from .models import AuthToken, ChatMessage, Dish, ScanEntry, User, UserStats, WorkoutPlan
from .services.fitness import (
    active_buffs, add_buff, buff_for_meal, buff_for_workout, seed_fitness,
)
from .services.food import analyze_barcode, analyze_text
from .services.loadout import find_loadout, format_loadout, loadout_names
from .services.prices import get_live_prices_cached
from .services.vision import (
    MAX_IMAGE_BYTES,
    capabilities,
    decode_barcode,
    ocr_text,
    scan_nutrition_label,
)
from .security import RequestBodyLimitMiddleware, parse_cors_origins
from .shadow_bot import (
    WARNINGS, command_on_cooldown, format_profile, moderate, parse_command,
)

app = FastAPI(title="SHADOW~1 Backend", version="2.1.0")

try:
    integration_request_bytes = int(os.environ.get("INTEGRATION_MAX_REQUEST_BYTES", "32768"))
except ValueError:
    integration_request_bytes = 32768
integration_request_bytes = max(8192, min(65536, integration_request_bytes))
app.add_middleware(
    RequestBodyLimitMiddleware,
    paths={
        "/api/v1/plan/draft",
        "/api/v1/assistant/respond",
        "/api/v1/stores/nearby",
    },
    max_bytes=integration_request_bytes,
)

origins = parse_cors_origins(os.environ.get("CORS_ORIGINS"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(api_v1_router)
app.include_router(guild_router)
app.include_router(social_router)
app.include_router(push_router)

MEDIA_DIR = os.environ.get("MEDIA_DIR", os.path.join(os.path.dirname(__file__), "..", "media"))
os.makedirs(MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


def _migrate_columns() -> None:
    """Leichte Additiv-Migration für bestehende SQLite-DBs: fehlende Spalten
    nachrüsten (create_all legt neue Tabellen an, ändert aber keine alten)."""
    wanted = {
        "dishes": [("steps", "TEXT DEFAULT ''"), ("image", "VARCHAR(512) DEFAULT ''"),
                   ("i18n", "TEXT DEFAULT '{}'")],
        "chat_messages": [("meta", "TEXT DEFAULT ''")],
    }
    with engine.begin() as conn:
        for table, cols in wanted.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in cols:
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


@app.on_event("startup")
def _init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_columns()
    db = SessionLocal()
    try:
        seed_fitness(db)   # Preset-Gerichte & -Trainingspläne (idempotent)
    finally:
        db.close()


# ═══ HEALTH ═══════════════════════════════════════════════════════════
@app.get("/api/health")
def health():
    return {"ok": True, "service": "shadow1-backend", "ts": time.time()}


# ═══ AUTH (pbkdf2 + Token in SQL) ═════════════════════════════════════
def _hash_pw(pw: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 120_000)
    return salt.hex() + ":" + dk.hex()


def _check_pw(pw: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), 120_000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


class RegisterIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/api/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "email already registered")
    count = db.scalar(select(User.id).order_by(User.id.desc())) or 0
    user = User(email=body.email.lower(), username=body.username,
                pw_hash=_hash_pw(body.password), uid_tag=f"#{count + 1:03d}")
    db.add(user)
    db.commit()
    token = secrets.token_hex(32)
    db.add(AuthToken(user_id=user.id, token=token))
    db.commit()
    return {"token": token, "uid": user.uid_tag, "username": user.username}


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not _check_pw(body.password, user.pw_hash):
        raise HTTPException(401, "invalid credentials")
    token = secrets.token_hex(32)
    db.add(AuthToken(user_id=user.id, token=token))
    db.commit()
    return {"token": token, "uid": user.uid_tag, "username": user.username}


# ═══ LIVE-MARKTPREISE (Open Prices Proxy, 12h-SQL-Cache) ══════════════
@app.get("/api/prices/live")
def prices_live(force: bool = False, db: Session = Depends(get_db)):
    return get_live_prices_cached(db, force=force)


# ═══ FOOD-ANALYSE (Open Food Facts Proxy) ═════════════════════════════
@app.get("/api/food/analyze")
def food_analyze(
    q: str | None = Query(default=None, max_length=200),
    barcode: str | None = Query(default=None, max_length=32),
    db: Session = Depends(get_db),
):
    if barcode:
        res = analyze_barcode(barcode.strip(), q)
        if res:
            return res
    if q and q.strip():
        res = analyze_text(db, q.strip())
        if res:
            return res
    return {"found": False}


# ═══ FOTO-SCAN: echte Bild-Auswertung (Barcode → OCR → ehrliches Nein) ═══
@app.post("/api/food/scan")
async def food_scan(
    file: UploadFile = File(...),
    q: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
):
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "max 8 MB")

    # 1) Barcode direkt vom Foto → exakte Produktdaten
    code = decode_barcode(data)
    if code:
        res = analyze_barcode(code, q)
        if res:
            res["source"] = "photo-barcode"
            res["barcode"] = code
            return res

    # 2) Text-Hint des Users → validierte Volltextsuche
    if q and q.strip():
        res = analyze_text(db, q.strip())
        if res:
            return res

    # 3) OCR des Verpackungstexts (optional, nur mit installiertem tesseract)
    ocr_q = ocr_text(data)
    if ocr_q:
        res = analyze_text(db, ocr_q)
        if res:
            res["source"] = "photo-ocr"
            return res

    # 4) Ehrliches Ergebnis statt Fantasie-Werten
    return {"found": False, "capabilities": capabilities(), "barcode": code}


@app.post("/api/food/label")
async def food_label(file: UploadFile = File(...)):
    """Explicit server OCR for nutrition-label verification.

    The frontend calls this only after the user taps the verification action;
    ordinary barcode photos continue to stay on the device.
    """
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "max 8 MB")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(415, "image required")
    return scan_nutrition_label(data)


# ═══ SCAN-HISTORIE ════════════════════════════════════════════════════
class ScanIn(BaseModel):
    uid: str = Field(max_length=16)
    name: str = Field(max_length=255)
    kcal: int = 0
    prot: int = 0
    carb: int = 0
    fat: int = 0
    sug: int = 0


@app.post("/api/scans")
def add_scan(body: ScanIn, db: Session = Depends(get_db)):
    db.add(ScanEntry(uid_tag=body.uid, name=body.name, kcal=body.kcal,
                     prot=body.prot, carb=body.carb, fat=body.fat, sug=body.sug))
    db.commit()
    return {"ok": True}


@app.get("/api/scans/{uid}")
def list_scans(uid: str, limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ScanEntry).where(ScanEntry.uid_tag == uid)
        .order_by(ScanEntry.ts.desc()).limit(min(limit, 200))
    ).all()
    return {"scans": [{
        "name": r.name, "kcal": r.kcal, "prot": r.prot,
        "carb": r.carb, "fat": r.fat, "sug": r.sug, "ts": r.ts,
    } for r in rows]}


# ═══ RPG-STATS-SYNC (für den Shadow Bot: !profile / !stats) ═══════════
class StatsIn(BaseModel):
    uid: str = Field(max_length=16)
    name: str = Field(default="", max_length=80)
    rank: str = Field(default="Shadow Novice", max_length=48)
    xp: int = 0
    level: int = 1
    attrs: dict[str, int] = Field(default_factory=dict)
    achievements: int = 0
    titles: int = 0
    equipped_title: str = Field(default="", max_length=48)
    streak: int = 0


@app.post("/api/profile/sync")
def profile_sync(body: StatsIn, db: Session = Depends(get_db)):
    row = db.get(UserStats, body.uid)
    if not row:
        row = UserStats(uid_tag=body.uid)
        db.add(row)
    row.name = body.name
    row.rank = body.rank
    row.xp = body.xp
    row.level = body.level
    row.attrs_json = json.dumps({k: int(v) for k, v in (body.attrs or {}).items()})
    row.achievements = body.achievements
    row.titles = body.titles
    row.equipped_title = body.equipped_title
    row.streak = body.streak
    row.ts = time.time()
    db.commit()
    return {"ok": True}


# ═══ MATERIA FUEL — Gerichte & User-Rezepte ══════════════════════════
def _dish_out(d: Dish) -> dict:
    return {
        "id": d.id, "name": d.name, "category": d.category,
        "ingredients": [ln for ln in (d.ingredients or "").split("\n") if ln.strip()],
        "steps": [ln for ln in (d.steps or "").split("\n") if ln.strip()],
        "prep_min": d.prep_min, "kcal": d.kcal, "prot": d.prot, "carb": d.carb, "fat": d.fat,
        "equipment": [e for e in (d.equipment or "").split(",") if e], "icon": d.icon,
        "image": d.image or "", "i18n": json.loads(getattr(d, "i18n", None) or "{}"),
        "is_preset": bool(d.is_preset), "owner_uid": d.owner_uid,
    }


@app.get("/api/dishes")
def list_dishes(category: str | None = None, equipment: str | None = None,
                owner: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Dish)
    if category:
        stmt = stmt.where(Dish.category == category)
    if owner:
        stmt = stmt.where((Dish.is_preset == 1) | (Dish.owner_uid == owner))
    rows = db.scalars(stmt.order_by(Dish.is_preset.desc(), Dish.name)).all()
    out = [_dish_out(d) for d in rows]
    if equipment:  # csv-Feld enthält den Filterwert
        out = [d for d in out if equipment in d["equipment"]]
    return {"dishes": out}


@app.get("/api/dishes/{dish_id}")
def get_dish(dish_id: int, db: Session = Depends(get_db)):
    d = db.get(Dish, dish_id)
    if not d:
        raise HTTPException(404, "dish not found")
    return _dish_out(d)


class DishIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="main", max_length=24)
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    prep_min: int = 0
    kcal: int = 0
    prot: int = 0
    carb: int = 0
    fat: int = 0
    equipment: list[str] = Field(default_factory=list)
    icon: str = Field(default="🍽", max_length=8)
    image: str = Field(default="", max_length=512)
    i18n: dict = Field(default_factory=dict)
    owner_uid: str = Field(default="", max_length=16)


@app.post("/api/dishes")
def create_dish(body: DishIn, db: Session = Depends(get_db)):
    d = Dish(
        name=body.name, category=body.category,
        ingredients="\n".join(body.ingredients), steps="\n".join(body.steps),
        prep_min=body.prep_min,
        kcal=body.kcal, prot=body.prot, carb=body.carb, fat=body.fat,
        equipment=",".join(body.equipment), icon=body.icon or "🍽",
        image=body.image or "", i18n=json.dumps(body.i18n or {}),
        is_preset=0, owner_uid=body.owner_uid,
    )
    db.add(d)
    db.commit()
    return _dish_out(d)


# ═══ PROTOCOL TRAINING — Trainingspläne ══════════════════════════════
def _plan_out(w: WorkoutPlan) -> dict:
    return {
        "id": w.id, "name": w.name, "kind": w.kind, "focus": w.focus,
        "exercises": json.loads(w.exercises_json or "[]"), "icon": w.icon,
        "is_preset": bool(w.is_preset), "owner_uid": w.owner_uid,
    }


@app.get("/api/workouts")
def list_workouts(owner: str | None = None, db: Session = Depends(get_db)):
    stmt = select(WorkoutPlan)
    if owner:
        stmt = stmt.where((WorkoutPlan.is_preset == 1) | (WorkoutPlan.owner_uid == owner))
    rows = db.scalars(stmt.order_by(WorkoutPlan.is_preset.desc(), WorkoutPlan.name)).all()
    return {"workouts": [_plan_out(w) for w in rows]}


@app.get("/api/workouts/{plan_id}")
def get_workout(plan_id: int, db: Session = Depends(get_db)):
    w = db.get(WorkoutPlan, plan_id)
    if not w:
        raise HTTPException(404, "workout not found")
    return _plan_out(w)


class ExerciseIn(BaseModel):
    name: str = Field(max_length=80)
    sets: int = 3
    reps: str = Field(default="10", max_length=16)
    weight: str = Field(default="", max_length=16)
    rest: int = 60


class WorkoutIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="split", max_length=24)
    focus: str = Field(default="", max_length=80)
    exercises: list[ExerciseIn] = Field(default_factory=list)
    icon: str = Field(default="🏋", max_length=8)
    owner_uid: str = Field(default="", max_length=16)


@app.post("/api/workouts")
def create_workout(body: WorkoutIn, db: Session = Depends(get_db)):
    w = WorkoutPlan(
        name=body.name, kind=body.kind, focus=body.focus,
        exercises_json=json.dumps([e.model_dump() for e in body.exercises]),
        icon=body.icon or "🏋", is_preset=0, owner_uid=body.owner_uid,
    )
    db.add(w)
    db.commit()
    return _plan_out(w)


# ═══ MEGA-FEATURE: STAT BUFFS (Log → temporärer Attribut-Boost) ══════
class LogMealIn(BaseModel):
    uid: str = Field(max_length=16)
    name: str = Field(default="", max_length=120)
    prot: int = 0
    kcal: int = 0


class LogWorkoutIn(BaseModel):
    uid: str = Field(max_length=16)
    name: str = Field(default="", max_length=120)
    kind: str = Field(default="fullbody", max_length=24)


@app.post("/api/log/meal")
def log_meal(body: LogMealIn, db: Session = Depends(get_db)):
    spec = buff_for_meal(body.prot, body.kcal)
    row = add_buff(db, body.uid, "meal", spec)
    return {"ok": True, "buff": {
        "label": row.label, "icon": row.icon, "desc": spec["desc"],
        "boosts": spec["boosts"], "expires_at": row.expires_at,
        "remaining": int(row.expires_at - time.time()),
    }}


@app.post("/api/log/workout")
def log_workout(body: LogWorkoutIn, db: Session = Depends(get_db)):
    spec = buff_for_workout(body.kind)
    row = add_buff(db, body.uid, "workout", spec)
    return {"ok": True, "buff": {
        "label": row.label, "icon": row.icon, "desc": spec["desc"],
        "boosts": spec["boosts"], "expires_at": row.expires_at,
        "remaining": int(row.expires_at - time.time()),
    }}


@app.get("/api/buffs/{uid}")
def get_buffs(uid: str, db: Session = Depends(get_db)):
    return {"buffs": active_buffs(db, uid)}


# ═══ CHAT: MEDIA-UPLOAD ═══════════════════════════════════════════════
ALLOWED_IMG = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
MAX_UPLOAD = 3 * 1024 * 1024  # 3 MB

MAGIC = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"RIFF": ".webp",
    b"GIF8": ".gif",
}


@app.post("/api/chat/upload")
async def chat_upload(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMG:
        raise HTTPException(415, "only jpeg/png/webp/gif images allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "max 3 MB")
    if not any(data.startswith(m) for m in MAGIC):
        raise HTTPException(415, "file content is not a supported image")
    ext = ALLOWED_IMG[file.content_type]
    name = f"{int(time.time())}_{secrets.token_hex(8)}{ext}"
    with open(os.path.join(MEDIA_DIR, name), "wb") as f:
        f.write(data)
    return {"url": f"/media/{name}"}


# ═══ CHAT: WEBSOCKET-RÄUME + SHADOW BOT ═══════════════════════════════
ROOMS = {"global", "de", "en", "ja", "ko", "es", "tr"}
HISTORY_LIMIT = 50
MAX_TEXT_LEN = 800


class Hub:
    """Verbindungs-Verwaltung pro Raum + Broadcast + Live-Präsenz.
    Pro Socket wird {uid, user, title} gehalten, damit die Präsenz eine
    vollständige Roster-Liste (für die Sidebar) senden kann."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {r: set() for r in ROOMS}
        self.meta: dict[WebSocket, dict] = {}

    async def join(self, room: str, ws: WebSocket, meta: dict) -> None:
        await ws.accept()
        self.rooms[room].add(ws)
        self.meta[ws] = meta

    def leave(self, room: str, ws: WebSocket) -> None:
        self.rooms[room].discard(ws)
        self.meta.pop(ws, None)

    async def broadcast(self, room: str, payload: dict) -> None:
        dead = []
        for ws in self.rooms[room]:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.leave(room, ws)

    async def send_to(self, ws: WebSocket, payload: dict) -> None:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            pass

    def roster(self, room: str) -> list[dict]:
        """Aktive User im Raum, nach Name sortiert (dedupliziert per uid)."""
        seen: dict[str, dict] = {}
        for ws in self.rooms[room]:
            m = self.meta.get(ws)
            if m:
                seen[m["uid"]] = {"uid": m["uid"], "user": m["user"], "title": m.get("title", "")}
        return sorted(seen.values(), key=lambda x: x["user"].lower())

    async def presence(self, room: str) -> None:
        """Live-Roster + Zähler an alle im Raum — bei Join und Leave."""
        roster = self.roster(room)
        await self.broadcast(room, {
            "type": "presence", "room": room,
            "count": len(roster), "roster": roster, "ts": time.time(),
        })


hub = Hub()


def _bot_msg(text: str) -> dict:
    return {"type": "bot", "user": "SHADOW BOT", "uid": "◈", "text": text, "ts": time.time()}


async def _handle_command(ws: WebSocket, room: str, uid: str, user: str, cmd: str, arg: str) -> None:
    """Bot-Befehle: !profile/!stats (privat) · !loadout/!help (im Raum)."""
    if cmd in ("profile", "stats"):
        db = SessionLocal()
        try:
            row = db.get(UserStats, uid)
        finally:
            db.close()
        if not row:
            await hub.send_to(ws, _bot_msg(
                f"◈ Noch keine Akte für `{uid}` gespeichert, {user}. "
                "Öffne einmal dein Profil im Terminal, damit die Schatten deine Werte lesen."))
            return
        stats = {
            "name": row.name or user, "uid_tag": row.uid_tag, "rank": row.rank,
            "xp": row.xp, "streak": row.streak, "achievements": row.achievements,
            "equipped_title": row.equipped_title,
            "attrs": json.loads(row.attrs_json or "{}"),
        }
        await hub.send_to(ws, _bot_msg(format_profile(stats)))   # privat an den Absender
        return

    if cmd == "loadout":
        found = find_loadout(arg)
        if not found:
            await hub.send_to(ws, _bot_msg(
                f"◈ Kein Loadout für „{arg or '—'}" + "\" gefunden.\n▸ Verfügbar: "
                + ", ".join(loadout_names())))
            return
        name, data = found
        await hub.broadcast(room, _bot_msg(format_loadout(name, data)))   # im Raum sichtbar
        return

    if cmd == "help":
        await hub.send_to(ws, _bot_msg(
            "◈ **SHADOW BOT — Befehle**\n"
            "▸ **!profile** / **!stats** — deine RPG-Akte\n"
            "▸ **!loadout <Name>** — optimiertes Setup (z. B. `!loadout Fennec`)\n"
            "▸ **!help** — diese Übersicht"))
        return

    # Unbekannter Befehl → dezenter Hinweis, nur an den Absender
    await hub.send_to(ws, _bot_msg(f"◈ Unbekannter Befehl `!{cmd}`. Versuch **!help**."))


@app.websocket("/ws/chat/{room}")
async def chat_ws(ws: WebSocket, room: str, user: str = "Shadow", uid: str = "#000", title: str = ""):
    if room not in ROOMS:
        await ws.close(code=4404)
        return
    user = user.strip()[:40] or "Shadow"
    uid = uid.strip()[:8] or "#000"
    title = title.strip()[:48]
    sender_key = f"{uid}:{user}"

    await hub.join(room, ws, {"uid": uid, "user": user, "title": title})
    # Historie aus der SQL-DB (letzte 50 Nachrichten)
    db: Session = SessionLocal()
    try:
        rows = db.scalars(
            select(ChatMessage).where(ChatMessage.room == room)
            .order_by(ChatMessage.ts.desc()).limit(HISTORY_LIMIT)
        ).all()
        history = [{
            "type": "msg", "room": room, "user": r.user, "uid": r.uid_tag,
            "text": r.text, "media": r.media or None, "ts": r.ts,
            "recipe": json.loads(r.meta) if getattr(r, "meta", "") else None,
        } for r in reversed(rows)]
        await ws.send_text(json.dumps({"type": "history", "messages": history}))
    finally:
        db.close()

    await hub.presence(room)   # Live-Präsenz: alle sehen das neue Roster

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if data.get("type") != "msg":
                continue
            text = str(data.get("text") or "")[:MAX_TEXT_LEN].strip()
            media = data.get("media")
            media = str(media)[:512] if media else None
            if not text and not media:
                continue

            # ── SHADOW BOT: Befehle (!profile / !loadout …) VOR Moderation ──
            cmd = parse_command(text)
            if cmd:
                if not command_on_cooldown(sender_key):
                    await _handle_command(ws, room, uid, user, cmd[0], cmd[1])
                continue

            # ── SHADOW BOT: Moderation VOR Persistenz & Broadcast ──
            reason = moderate(sender_key, text)
            if reason:
                await ws.send_text(json.dumps({
                    "type": "warning", "reason": reason,
                    "text": WARNINGS.get(reason, WARNINGS["scam"]), "ts": time.time(),
                }))
                continue

            ts = time.time()
            db = SessionLocal()
            try:
                db.add(ChatMessage(room=room, user=user, uid_tag=uid, text=text, media=media or ""))
                db.commit()
            finally:
                db.close()
            await hub.broadcast(room, {
                "type": "msg", "room": room, "user": user, "uid": uid, "title": title,
                "text": text, "media": media, "ts": ts,
            })
    except WebSocketDisconnect:
        pass
    finally:
        hub.leave(room, ws)
        try:
            await hub.presence(room)   # sofortiges Roster-Update bei Disconnect
        except Exception:
            pass


# ═══ REZEPT-SHARING — geteiltes Rezept als Chat-Card ═════════════════
class ShareRecipeIn(BaseModel):
    room: str = Field(default="global", max_length=24)
    user: str = Field(default="Shadow", max_length=40)
    uid: str = Field(default="#000", max_length=16)
    title: str = Field(default="", max_length=48)
    recipe: dict = Field(default_factory=dict)


@app.post("/api/chat/share")
async def share_recipe(body: ShareRecipeIn):
    """Postet ein Rezept als spezielle Card in einen Chat-Raum: persistiert
    (mit JSON-Payload in meta) und broadcastet live an alle Verbundenen."""
    room = body.room if body.room in ROOMS else "global"
    r = body.recipe or {}
    name = str(r.get("name") or "Rezept")[:120]
    # kompakte, sanitisierte Payload für die Card
    recipe = {
        "name": name, "icon": str(r.get("icon") or "🍽")[:8],
        "image": str(r.get("image") or "")[:512], "category": str(r.get("category") or "main")[:24],
        "prep_min": int(r.get("prep_min") or 0),
        "kcal": int(r.get("kcal") or 0), "prot": int(r.get("prot") or 0),
        "carb": int(r.get("carb") or 0), "fat": int(r.get("fat") or 0),
        "equipment": [str(e)[:16] for e in (r.get("equipment") or [])][:4],
        "ingredients": [str(x)[:120] for x in (r.get("ingredients") or [])][:30],
        "steps": [str(x)[:400] for x in (r.get("steps") or [])][:15],
    }
    # Übersetzungen (en/tr) unverändert durchreichen, damit die Card in jeder
    # Sprache angezeigt werden kann
    i18n_in = r.get("i18n") or {}
    if isinstance(i18n_in, dict):
        recipe["i18n"] = {
            lg: {
                "name": str(v.get("name") or "")[:120],
                "ingredients": [str(x)[:120] for x in (v.get("ingredients") or [])][:30],
                "steps": [str(x)[:400] for x in (v.get("steps") or [])][:15],
            }
            for lg, v in list(i18n_in.items())[:5] if isinstance(v, dict)
        }
    user = body.user.strip()[:40] or "Shadow"
    uid = body.uid.strip()[:16] or "#000"
    ts = time.time()
    text = f"◈ Rezept geteilt: {name}"
    db = SessionLocal()
    try:
        db.add(ChatMessage(room=room, user=user, uid_tag=uid, text=text,
                           media="", meta=json.dumps(recipe, ensure_ascii=False)))
        db.commit()
    finally:
        db.close()
    await hub.broadcast(room, {
        "type": "msg", "room": room, "user": user, "uid": uid, "title": body.title.strip()[:48],
        "text": text, "media": None, "recipe": recipe, "ts": ts,
    })
    return {"ok": True, "room": room}
