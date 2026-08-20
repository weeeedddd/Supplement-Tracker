"""◈ AGENT TRAINING PROTOCOLS & MATERIA FUEL — Seed-Daten + Buff-Logik.

· Preset-Gerichte (Airfryer / Reiskocher / Herd) mit exakten Makros
· Preset-Trainingspläne (PPL, Ganzkörper) mit Übungen
· Stat-Buff-Berechnung: geloggte Mahlzeit / Workout → temporärer
  Attribut-Boost (Mega-Feature)
"""
from __future__ import annotations

import json
import pathlib
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Dish, StatBuff, WorkoutPlan

# ── Preset-Gerichte ──────────────────────────────────────────────────
#   Der komplette Rezept-Katalog (100+) liegt in dishes_seed.json und wird
#   aus einer gemeinsamen Quelle mit dem Frontend generiert (identische Daten).
_SEED_PATH = pathlib.Path(__file__).with_name("dishes_seed.json")
try:
    PRESET_DISHES = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
except FileNotFoundError:
    PRESET_DISHES = []

# ── Preset-Trainingspläne ────────────────────────────────────────────
def _ex(name, sets, reps, weight, rest):
    return {"name": name, "sets": sets, "reps": reps, "weight": weight, "rest": rest}

PRESET_WORKOUTS = [
    {"name": "Push Day", "kind": "push", "focus": "Brust · Schultern · Trizeps", "icon": "🏋", "exercises": [
        _ex("Bankdrücken", 4, "6-8", "80 kg", 120),
        _ex("Schrägbank-Kurzhantel", 3, "10", "24 kg", 90),
        _ex("Schulterdrücken", 3, "10", "18 kg", 90),
        _ex("Seitheben", 3, "15", "10 kg", 60),
        _ex("Trizeps-Pushdown", 3, "12", "25 kg", 60),
    ]},
    {"name": "Pull Day", "kind": "pull", "focus": "Rücken · Bizeps", "icon": "🏋", "exercises": [
        _ex("Klimmzüge", 4, "8", "BW", 120),
        _ex("Langhantelrudern", 4, "8", "70 kg", 100),
        _ex("Latzug", 3, "12", "55 kg", 90),
        _ex("Face Pulls", 3, "15", "20 kg", 60),
        _ex("Bizeps-Curls", 3, "12", "14 kg", 60),
    ]},
    {"name": "Leg Day", "kind": "legs", "focus": "Quads · Hamstrings · Waden", "icon": "🦵", "exercises": [
        _ex("Kniebeugen", 4, "6-8", "100 kg", 150),
        _ex("Rumänisches Kreuzheben", 3, "10", "80 kg", 120),
        _ex("Beinpresse", 3, "12", "160 kg", 90),
        _ex("Beinbeuger", 3, "12", "40 kg", 75),
        _ex("Wadenheben", 4, "15", "60 kg", 45),
    ]},
    {"name": "Ganzkörper Basis", "kind": "fullbody", "focus": "Kraft-Grundlagen für Einsteiger", "icon": "⚡", "exercises": [
        _ex("Kniebeugen", 3, "10", "50 kg", 90),
        _ex("Bankdrücken", 3, "10", "50 kg", 90),
        _ex("Langhantelrudern", 3, "10", "45 kg", 90),
        _ex("Schulterdrücken", 3, "12", "14 kg", 75),
        _ex("Plank", 3, "45s", "BW", 45),
    ]},
]


def seed_fitness(db: Session) -> None:
    """Presets anlegen bzw. fehlende ergänzen (idempotent über den Namen).
    So wächst eine bereits geseedete DB automatisch auf den neuen Katalog."""
    by_name = {d.name: d for d in db.scalars(select(Dish).where(Dish.is_preset == 1)).all()}
    for d in PRESET_DISHES:
        row = by_name.get(d["name"])
        if row is None:
            db.add(Dish(is_preset=1, **d))
            continue
        # Legacy-Presets (vor steps/image/i18n geseedet) mit Katalogdaten anreichern
        if not (row.image or "").strip():
            row.image = d.get("image", "")
        if not (row.steps or "").strip():
            row.steps = d.get("steps", "")
        if not (getattr(row, "i18n", "") or "").strip() or row.i18n == "{}":
            row.i18n = d.get("i18n", "{}")

    existing_plans = set(db.scalars(select(WorkoutPlan.name).where(WorkoutPlan.is_preset == 1)).all())
    for w in PRESET_WORKOUTS:
        if w["name"] in existing_plans:
            continue
        plan = dict(w)
        ex = plan.pop("exercises")
        db.add(WorkoutPlan(is_preset=1, exercises_json=json.dumps(ex), **plan))
    db.commit()


# ── MEGA-FEATURE: Stat-Buff-Berechnung ───────────────────────────────
BUFF_TTL = {"meal": 6 * 3600, "workout": 6 * 3600}


def buff_for_meal(prot: int, kcal: int) -> dict:
    """Regel-basierter Buff je nach Makros der geloggten Mahlzeit."""
    if prot >= 30:
        return {"label": "High-Protein Meal", "icon": "🥩",
                "boosts": {"STR": 10, "VIT": 10}, "desc": "+10 Physische Basiswerte"}
    if kcal >= 500:
        return {"label": "Energie-Schub", "icon": "🔥",
                "boosts": {"VIT": 8}, "desc": "+8 Vitalität"}
    return {"label": "Materia getankt", "icon": "🍽",
            "boosts": {"VIT": 5}, "desc": "+5 Vitalität"}


def buff_for_workout(kind: str) -> dict:
    base = {"STR": 5, "INT": 5}
    if kind == "legs":
        base = {"STR": 8, "VIT": 4}
    elif kind in ("push", "pull"):
        base = {"STR": 7, "INT": 3}
    return {"label": "Protokoll absolviert", "icon": "⚡",
            "boosts": base, "desc": "+" + " · +".join(f"{v} {k}" for k, v in base.items())}


def add_buff(db: Session, uid: str, source: str, spec: dict) -> StatBuff:
    now = time.time()
    row = StatBuff(
        uid_tag=uid, source=source, label=spec["label"], icon=spec["icon"],
        boosts_json=json.dumps(spec["boosts"]),
        created=now, expires_at=now + BUFF_TTL.get(source, 6 * 3600),
    )
    db.add(row)
    db.commit()
    return row


def active_buffs(db: Session, uid: str) -> list[dict]:
    now = time.time()
    rows = db.scalars(
        select(StatBuff).where(StatBuff.uid_tag == uid, StatBuff.expires_at > now)
        .order_by(StatBuff.expires_at.desc())
    ).all()
    return [{
        "id": r.id, "source": r.source, "label": r.label, "icon": r.icon,
        "boosts": json.loads(r.boosts_json or "{}"),
        "created": r.created, "expires_at": r.expires_at,
        "remaining": int(r.expires_at - now),
    } for r in rows]
