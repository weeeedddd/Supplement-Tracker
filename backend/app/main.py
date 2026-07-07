"""◈ SHADOW~1 Backend — FastAPI

Start:  uvicorn app.main:app --host 0.0.0.0 --port 8000
Env:    DATABASE_URL   (default sqlite:///./shadow.db)
        CORS_ORIGINS   (kommagetrennt; default * für einfaches Self-Hosting)
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

from .db import Base, SessionLocal, engine, get_db
from .models import AuthToken, ChatMessage, ScanEntry, User
from .services.food import analyze_barcode, analyze_text
from .services.prices import get_live_prices_cached
from .shadow_bot import WARNINGS, moderate

app = FastAPI(title="SHADOW~1 Backend", version="2.0.0")

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR = os.environ.get("MEDIA_DIR", os.path.join(os.path.dirname(__file__), "..", "media"))
os.makedirs(MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


@app.on_event("startup")
def _init_db() -> None:
    Base.metadata.create_all(bind=engine)


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
ROOMS = {"global", "de", "en", "ja", "ko", "es"}
HISTORY_LIMIT = 50
MAX_TEXT_LEN = 800


class Hub:
    """Verbindungs-Verwaltung pro Raum + Broadcast."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {r: set() for r in ROOMS}

    async def join(self, room: str, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[room].add(ws)

    def leave(self, room: str, ws: WebSocket) -> None:
        self.rooms[room].discard(ws)

    async def broadcast(self, room: str, payload: dict) -> None:
        dead = []
        for ws in self.rooms[room]:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.rooms[room].discard(ws)


hub = Hub()


@app.websocket("/ws/chat/{room}")
async def chat_ws(ws: WebSocket, room: str, user: str = "Shadow", uid: str = "#000"):
    if room not in ROOMS:
        await ws.close(code=4404)
        return
    user = user.strip()[:40] or "Shadow"
    uid = uid.strip()[:8] or "#000"
    sender_key = f"{uid}:{user}"

    await hub.join(room, ws)
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
        } for r in reversed(rows)]
        await ws.send_text(json.dumps({"type": "history", "messages": history}))
    finally:
        db.close()

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
                "type": "msg", "room": room, "user": user, "uid": uid,
                "text": text, "media": media, "ts": ts,
            })
    except WebSocketDisconnect:
        pass
    finally:
        hub.leave(room, ws)
