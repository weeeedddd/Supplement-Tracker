"""Authenticated Web Push subscription and preference routes."""
from __future__ import annotations

import os
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .guild_api import current_user
from .models import PushPreference, PushSubscription, User
from .push_service import process_due_pushes, push_configured

router = APIRouter(prefix="/api/v1/push", tags=["push"])


class PushKeysIn(BaseModel):
    p256dh: str = Field(min_length=20, max_length=180)
    auth: str = Field(min_length=8, max_length=180)


class SubscribeIn(BaseModel):
    endpoint: HttpUrl
    keys: PushKeysIn


class UnsubscribeIn(BaseModel):
    endpoint: HttpUrl


class PreferenceIn(BaseModel):
    enabled: bool = False
    training: bool = True
    recovery: bool = True
    supplements: bool = False
    hydration: bool = False
    meals: bool = False
    unfinishedSets: bool = True
    streakRescue: bool = True
    trainingTime: str = Field(default="18:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    supplementTime: str = Field(default="09:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quietStart: str = Field(default="22:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quietEnd: str = Field(default="07:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(default="UTC", min_length=1, max_length=64)


class SnoozeIn(BaseModel):
    minutes: int = Field(default=60, ge=0, le=7 * 24 * 60)


def _preference(db: Session, user_id: int) -> PushPreference:
    row = db.get(PushPreference, user_id)
    if not row:
        row = PushPreference(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def _payload(row: PushPreference) -> dict:
    return {
        "enabled": bool(row.enabled), "training": bool(row.training),
        "recovery": bool(row.recovery), "supplements": bool(row.supplements),
        "hydration": bool(row.hydration), "meals": bool(row.meals),
        "unfinishedSets": bool(row.unfinished_sets),
        "streakRescue": bool(row.streak_rescue), "trainingTime": row.training_time,
        "supplementTime": row.supplement_time, "quietStart": row.quiet_start,
        "quietEnd": row.quiet_end, "timezone": row.timezone,
        "snoozedUntil": row.snoozed_until,
    }


@router.get("/public-key")
def public_key() -> dict:
    return {
        "configured": push_configured(),
        "publicKey": os.environ.get("VAPID_PUBLIC_KEY", "").strip(),
    }


@router.post("/subscribe")
def subscribe(
    body: SubscribeIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not push_configured():
        raise HTTPException(503, "push is not configured")
    endpoint = str(body.endpoint)
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    now = time.time()
    if not row:
        row = PushSubscription(
            user_id=user.id, endpoint=endpoint,
            p256dh=body.keys.p256dh, auth=body.keys.auth,
            created=now, updated=now,
        )
        db.add(row)
    else:
        row.user_id = user.id
        row.p256dh = body.keys.p256dh
        row.auth = body.keys.auth
        row.updated = now
        row.failure_count = 0
    db.commit()
    return {"ok": True, "subscriptionId": row.id}


@router.post("/unsubscribe")
def unsubscribe(
    body: UnsubscribeIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = db.scalar(select(PushSubscription).where(
        PushSubscription.endpoint == str(body.endpoint),
        PushSubscription.user_id == user.id,
    ))
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


@router.get("/preferences")
def get_preferences(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = _preference(db, user.id)
    db.commit()
    subscriptions = db.scalar(select(PushSubscription.id).where(PushSubscription.user_id == user.id))
    return {"preferences": _payload(row), "subscribed": bool(subscriptions), "configured": push_configured()}


@router.post("/preferences")
def save_preferences(
    body: PreferenceIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        ZoneInfo(body.timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(422, "invalid timezone") from exc
    row = _preference(db, user.id)
    row.enabled = int(body.enabled)
    row.training = int(body.training)
    row.recovery = int(body.recovery)
    row.supplements = int(body.supplements)
    row.hydration = int(body.hydration)
    row.meals = int(body.meals)
    row.unfinished_sets = int(body.unfinishedSets)
    row.streak_rescue = int(body.streakRescue)
    row.training_time = body.trainingTime
    row.supplement_time = body.supplementTime
    row.quiet_start = body.quietStart
    row.quiet_end = body.quietEnd
    row.timezone = body.timezone
    row.updated = time.time()
    db.commit()
    return {"ok": True, "preferences": _payload(row)}


@router.post("/snooze")
def snooze(
    body: SnoozeIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    row = _preference(db, user.id)
    row.snoozed_until = time.time() + body.minutes * 60 if body.minutes else 0
    row.updated = time.time()
    db.commit()
    return {"ok": True, "snoozedUntil": row.snoozed_until}


@router.post("/process")
def process(
    x_coreline_cron: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    expected = os.environ.get("PUSH_CRON_SECRET", "").strip()
    if not expected or x_coreline_cron != expected:
        raise HTTPException(404, "not found")
    return process_due_pushes(db)
