"""◈ AGENT TRAINING PROTOCOLS & MATERIA FUEL — Seed-Daten + Buff-Logik.

· Preset-Gerichte (Airfryer / Reiskocher / Herd) mit exakten Makros
· Preset-Trainingspläne (PPL, Ganzkörper) mit Übungen
· Stat-Buff-Berechnung: geloggte Mahlzeit / Workout → temporärer
  Attribut-Boost (Mega-Feature)
"""
from __future__ import annotations

import json
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Dish, StatBuff, WorkoutPlan

# ── Preset-Gerichte ──────────────────────────────────────────────────
PRESET_DISHES = [
    {"name": "Airfryer Cordon Bleu", "category": "main", "prep_min": 20, "kcal": 480, "prot": 34, "carb": 22, "fat": 26,
     "equipment": "airfryer", "icon": "🍗",
     "ingredients": "2 Hähnchenschnitzel\n2 Scheiben Kochschinken\n2 Scheiben Käse\nSemmelbrösel\n1 Ei\nSalz, Pfeffer"},
    {"name": "Airfryer Süßkartoffel-Pommes", "category": "main", "prep_min": 18, "kcal": 310, "prot": 5, "carb": 58, "fat": 7,
     "equipment": "airfryer", "icon": "🍠",
     "ingredients": "1 große Süßkartoffel\n1 EL Olivenöl\nPaprikapulver\nSalz"},
    {"name": "Airfryer Lachs & Brokkoli", "category": "main", "prep_min": 15, "kcal": 420, "prot": 38, "carb": 12, "fat": 24,
     "equipment": "airfryer", "icon": "🐟",
     "ingredients": "180g Lachsfilet\n150g Brokkoli\n1 EL Olivenöl\nZitrone, Salz"},
    {"name": "Reiskocher Jollof Rice", "category": "main", "prep_min": 30, "kcal": 520, "prot": 22, "carb": 78, "fat": 12,
     "equipment": "ricecooker", "icon": "🍚",
     "ingredients": "200g Reis\n1 Dose Tomaten\n1 Zwiebel\n150g Hähnchen\nPaprika, Gewürze"},
    {"name": "Reiskocher Protein-Oats", "category": "breakfast", "prep_min": 12, "kcal": 390, "prot": 30, "carb": 52, "fat": 8,
     "equipment": "ricecooker", "icon": "🥣",
     "ingredients": "80g Haferflocken\n1 Scoop Proteinpulver\n250ml Milch\n1 Banane\nZimt"},
    {"name": "Reiskocher Hähnchen-Congee", "category": "main", "prep_min": 35, "kcal": 360, "prot": 28, "carb": 46, "fat": 6,
     "equipment": "ricecooker", "icon": "🍲",
     "ingredients": "100g Reis\n150g Hähnchen\n1L Brühe\nIngwer, Frühlingszwiebel"},
    {"name": "Magerquark-Bowl", "category": "breakfast", "prep_min": 5, "kcal": 320, "prot": 40, "carb": 30, "fat": 4,
     "equipment": "none", "icon": "🥛",
     "ingredients": "250g Magerquark\n100g Beeren\n20g Nüsse\n1 TL Honig"},
    {"name": "Protein-Pancakes", "category": "breakfast", "prep_min": 15, "kcal": 410, "prot": 35, "carb": 40, "fat": 10,
     "equipment": "stove", "icon": "🥞",
     "ingredients": "1 Banane\n2 Eier\n1 Scoop Protein\n40g Haferflocken"},
    {"name": "Airfryer Protein-Brownie", "category": "dessert", "prep_min": 20, "kcal": 240, "prot": 18, "carb": 24, "fat": 8,
     "equipment": "airfryer", "icon": "🍫",
     "ingredients": "1 Scoop Schoko-Protein\n1 Ei\n30g Haferflocken\n1 EL Kakao\nSüßstoff"},
    {"name": "Skyr-Eiscreme", "category": "dessert", "prep_min": 10, "kcal": 180, "prot": 22, "carb": 18, "fat": 2,
     "equipment": "none", "icon": "🍨",
     "ingredients": "300g Skyr\n1 Banane (gefroren)\nVanille\nSüßstoff"},
]

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
    """Presets einmalig anlegen (idempotent über Namen)."""
    if not db.scalar(select(Dish.id).where(Dish.is_preset == 1).limit(1)):
        for d in PRESET_DISHES:
            db.add(Dish(is_preset=1, **d))
    if not db.scalar(select(WorkoutPlan.id).where(WorkoutPlan.is_preset == 1).limit(1)):
        for w in PRESET_WORKOUTS:
            ex = w.pop("exercises")
            db.add(WorkoutPlan(is_preset=1, exercises_json=json.dumps(ex), **w))
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
