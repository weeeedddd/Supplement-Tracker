"""Authenticated friends, presence and RPG-style social inspection.

The browser owns the training data.  It sends a deliberately small public
snapshot; raw meals, notes, auth data and full workout history never enter the
friend graph.  Friendship checks are performed server-side for every private
profile or buff action.
"""
from __future__ import annotations

import json
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .guild_api import current_user
from .models import Friendship, SocialBuff, SocialProfile, User

router = APIRouter(prefix="/api/v1", tags=["social"])

PRESENCE_WINDOW = 300.0
BUFF_COOLDOWN = 3600.0
MUSCLE_IDS = {
    "shoulders", "chest", "biceps", "core", "quads",
    "back", "triceps", "glutes", "hamstrings", "calves",
}
CHARACTER_PATHS = {"toji", "goku", "tanjiro", "kaneki", "sanji", "baki", "mikasa"}


class WeeklyIn(BaseModel):
    activeDays: int = Field(default=0, ge=0, le=7)
    workouts: int = Field(default=0, ge=0, le=50)
    volumeKg: int = Field(default=0, ge=0, le=10_000_000)
    completedQuests: int = Field(default=0, ge=0, le=10_000)


class LiftIn(BaseModel):
    exerciseKey: str = Field(min_length=1, max_length=72)
    name: str = Field(min_length=1, max_length=80)
    weightKg: float = Field(default=0, ge=0, le=1000)
    reps: int = Field(default=0, ge=0, le=500)


class SocialSnapshotIn(BaseModel):
    characterPath: str = Field(default="", max_length=24)
    activePlan: str = Field(default="", max_length=120)
    activityKind: Literal["active", "training", "workout", "rest", "quest"] = "active"
    activityLabel: str = Field(default="", max_length=160)
    activityAt: float = Field(default=0, ge=0)
    streak: int = Field(default=0, ge=0, le=10_000)
    weekly: WeeklyIn = Field(default_factory=WeeklyIn)
    topLifts: list[LiftIn] = Field(default_factory=list, max_length=8)
    muscleLoads: dict[str, float] = Field(default_factory=dict, max_length=20)
    achievement: str = Field(default="", max_length=180)
    gender: Literal["", "male", "female"] = ""


class FriendInviteIn(BaseModel):
    identifier: str = Field(min_length=2, max_length=80)


class FriendRespondIn(BaseModel):
    friendshipId: int = Field(gt=0)
    action: Literal["accept", "decline"]


class FriendRemoveIn(BaseModel):
    uid: str = Field(min_length=2, max_length=16)


class BuffIn(BaseModel):
    uid: str = Field(min_length=2, max_length=16)
    kind: Literal["aura", "focus"]


def _pair(first: int, second: int) -> tuple[int, int]:
    return (first, second) if first < second else (second, first)


def _relationship(db: Session, first: int, second: int) -> Friendship | None:
    user_a, user_b = _pair(first, second)
    return db.scalar(select(Friendship).where(
        Friendship.user_a_id == user_a,
        Friendship.user_b_id == user_b,
    ))


def _accepted(db: Session, first: int, second: int) -> bool:
    row = _relationship(db, first, second)
    return bool(row and row.status == "accepted")


def _json(value: str, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


def _profile_payload(db: Session, user: User, viewer_id: int) -> dict:
    profile = db.get(SocialProfile, user.id)
    stamp = time.time()
    if not profile:
        return {
            "uid": user.uid_tag, "username": user.username, "online": False,
            "lastSeen": 0, "characterPath": "", "activePlan": "",
            "activity": {"kind": "away", "label": "", "at": 0},
            "streak": 0, "weekly": {}, "topLifts": [], "muscleLoads": {},
            "achievement": "", "gender": "", "me": user.id == viewer_id,
        }
    return {
        "uid": user.uid_tag,
        "username": user.username,
        "online": stamp - profile.last_seen < PRESENCE_WINDOW,
        "lastSeen": profile.last_seen,
        "characterPath": profile.character_path,
        "activePlan": profile.active_plan,
        "activity": {
            "kind": profile.activity_kind,
            "label": profile.activity_label,
            "at": profile.activity_at,
        },
        "streak": profile.streak,
        "weekly": _json(profile.weekly_json, {}),
        "topLifts": _json(profile.lifts_json, []),
        "muscleLoads": _json(profile.muscle_json, {}),
        "achievement": profile.achievement,
        "gender": profile.gender,
        "me": user.id == viewer_id,
    }


def _touch(db: Session, user: User) -> None:
    profile = db.get(SocialProfile, user.id)
    if profile:
        profile.last_seen = time.time()
        profile.updated = time.time()


@router.post("/social/profile")
def update_social_profile(
    body: SocialSnapshotIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    now = time.time()
    muscle = {
        key: max(0, min(100, round(float(value))))
        for key, value in body.muscleLoads.items()
        if key in MUSCLE_IDS and isinstance(value, (int, float))
    }
    character = body.characterPath if body.characterPath in CHARACTER_PATHS else ""
    values = {
        "character_path": character,
        "active_plan": body.activePlan.strip(),
        "activity_kind": body.activityKind,
        "activity_label": body.activityLabel.strip(),
        "activity_at": body.activityAt or now,
        "streak": body.streak,
        "weekly_json": json.dumps(body.weekly.model_dump(), separators=(",", ":")),
        "lifts_json": json.dumps([item.model_dump() for item in body.topLifts], separators=(",", ":")),
        "muscle_json": json.dumps(muscle, separators=(",", ":")),
        "achievement": body.achievement.strip(),
        "gender": body.gender,
        "last_seen": now,
        "updated": now,
    }
    profile = db.get(SocialProfile, user.id)
    if not profile:
        profile = SocialProfile(user_id=user.id, **values)
        db.add(profile)
    else:
        for key, value in values.items():
            setattr(profile, key, value)
    db.commit()
    return {"ok": True, "profile": _profile_payload(db, user, user.id)}


@router.get("/friends")
def friends(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    _touch(db, user)
    rows = db.scalars(select(Friendship).where(or_(
        Friendship.user_a_id == user.id,
        Friendship.user_b_id == user.id,
    )).order_by(Friendship.updated.desc())).all()

    accepted: list[dict] = []
    incoming: list[dict] = []
    outgoing: list[dict] = []
    for row in rows:
        other_id = row.user_b_id if row.user_a_id == user.id else row.user_a_id
        other = db.get(User, other_id)
        if not other:
            continue
        if row.status == "accepted":
            accepted.append(_profile_payload(db, other, user.id))
        elif row.requested_by_id == user.id:
            outgoing.append({"id": row.id, "uid": other.uid_tag, "username": other.username, "created": row.created})
        else:
            incoming.append({"id": row.id, "uid": other.uid_tag, "username": other.username, "created": row.created})

    buff_rows = db.execute(
        select(SocialBuff, User).join(User, User.id == SocialBuff.from_user_id)
        .where(SocialBuff.to_user_id == user.id)
        .order_by(SocialBuff.created.desc()).limit(20)
    ).all()
    buffs = [
        {"id": buff.id, "kind": buff.kind, "created": buff.created,
         "from": {"uid": sender.uid_tag, "username": sender.username}, "seen": bool(buff.seen)}
        for buff, sender in buff_rows
    ]
    for buff, _ in buff_rows:
        buff.seen = 1
    db.commit()
    return {"friends": accepted, "incoming": incoming, "outgoing": outgoing, "buffs": buffs}


@router.post("/friends/invite")
def invite_friend(
    body: FriendInviteIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    identifier = body.identifier.strip()
    target = db.scalar(select(User).where(or_(
        func.lower(User.uid_tag) == identifier.lower(),
        func.lower(User.username) == identifier.lower(),
    )).order_by(User.id).limit(1))
    if not target:
        raise HTTPException(404, "account not found")
    if target.id == user.id:
        raise HTTPException(422, "cannot invite yourself")
    existing = _relationship(db, user.id, target.id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(409, "already friends")
        if existing.requested_by_id == target.id:
            existing.status = "accepted"
            existing.updated = time.time()
            db.commit()
            return {"ok": True, "accepted": True}
        raise HTTPException(409, "invite already pending")

    user_a, user_b = _pair(user.id, target.id)
    row = Friendship(
        user_a_id=user_a, user_b_id=user_b, requested_by_id=user.id,
        status="pending", updated=time.time(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "invite already exists") from exc
    return {"ok": True, "accepted": False, "id": row.id}


@router.post("/friends/respond")
def respond_friend(
    body: FriendRespondIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = db.get(Friendship, body.friendshipId)
    if not row or user.id not in (row.user_a_id, row.user_b_id):
        raise HTTPException(404, "invite not found")
    if row.requested_by_id == user.id or row.status != "pending":
        raise HTTPException(403, "not an incoming invite")
    if body.action == "decline":
        db.delete(row)
    else:
        row.status = "accepted"
        row.updated = time.time()
    db.commit()
    return {"ok": True, "accepted": body.action == "accept"}


@router.post("/friends/remove")
def remove_friend(
    body: FriendRemoveIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    target = db.scalar(select(User).where(func.lower(User.uid_tag) == body.uid.strip().lower()))
    if not target:
        raise HTTPException(404, "account not found")
    row = _relationship(db, user.id, target.id)
    if not row:
        raise HTTPException(404, "friendship not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/friends/buff")
def send_buff(
    body: BuffIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    target = db.scalar(select(User).where(func.lower(User.uid_tag) == body.uid.strip().lower()))
    if not target or not _accepted(db, user.id, target.id):
        raise HTTPException(404, "friend not found")
    latest = db.scalar(select(SocialBuff).where(and_(
        SocialBuff.from_user_id == user.id,
        SocialBuff.to_user_id == target.id,
        SocialBuff.kind == body.kind,
    )).order_by(SocialBuff.created.desc()))
    now = time.time()
    if latest and now - latest.created < BUFF_COOLDOWN:
        raise HTTPException(429, "buff cooldown active", headers={"Retry-After": str(round(BUFF_COOLDOWN - (now - latest.created)))})
    row = SocialBuff(from_user_id=user.id, to_user_id=target.id, kind=body.kind, created=now)
    db.add(row)
    db.commit()
    return {"ok": True, "id": row.id, "availableAt": now + BUFF_COOLDOWN}
