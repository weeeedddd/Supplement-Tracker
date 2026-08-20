"""Gilden, geräteübergreifender Sync und Wochen-Raids.

Folgt den Konventionen aus api_v1.py: eigener Router mit /api/v1-Präfix,
IP-basierte Ratenbegrenzung auf den missbrauchsanfälligen Routen und
Autorisierung (403) strikt getrennt von Authentifizierung (401).

Gilden- und Raid-Kennungen werden immer aus der Mitgliedschaft des
Aufrufers abgeleitet, nie aus dem Request übernommen — damit ist die
gesamte IDOR-Klasse konstruktionsbedingt ausgeschlossen.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import secrets
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    AuthToken, Guild, GuildInvite, GuildMember, Raid, RaidContribution,
    SocialProfile, SyncBlob, User,
)
from .security import InMemoryRateLimiter

router = APIRouter(prefix="/api/v1", tags=["guild"])

PRESENCE_WINDOW = 300.0                                   # 5 min → "online"
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"      # ohne I/O/0/1
MAX_SYNC_BYTES = 512 * 1024
MAX_SYNC_KEYS = 800


def _bounded_limit(name: str, default: int, maximum: int) -> int:
    try:
        value = int((os.environ.get(name) or str(default)).strip())
    except ValueError:
        value = default
    return max(1, min(maximum, value))


_join_limiter = InMemoryRateLimiter(
    limit=_bounded_limit("GUILD_JOIN_RATE_LIMIT_PER_MINUTE", 10, 60), window_seconds=60,
)
_sync_limiter = InMemoryRateLimiter(
    limit=_bounded_limit("SYNC_RATE_LIMIT_PER_MINUTE", 20, 120), window_seconds=60,
)


def _rate_limit(limiter: InMemoryRateLimiter, route_name: str):
    async def enforce(request: Request, response: Response) -> None:
        client_host = request.client.host if request.client else "unknown"
        snapshot = limiter.check(f"{route_name}:{client_host}")
        response.headers["X-RateLimit-Limit"] = str(snapshot.limit)
        response.headers["X-RateLimit-Remaining"] = str(snapshot.remaining)
        if not snapshot.allowed:
            raise HTTPException(429, "rate limit exceeded",
                                headers={"Retry-After": str(snapshot.retry_after)})
    return enforce


# ── Authentifizierung ────────────────────────────────────────────────
def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Bearer-Token → User. Wirft ausschliesslich 401; ob der Nutzer etwas
    darf, entscheidet die jeweilige Route."""
    parts = (authorization or "").split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(401, "missing bearer token")
    row = db.scalar(select(AuthToken).where(AuthToken.token == parts[1].strip()))
    if not row:
        raise HTTPException(401, "invalid token")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "invalid token")
    return user


def _membership(db: Session, user_id: int) -> GuildMember | None:
    return db.scalar(select(GuildMember).where(GuildMember.user_id == user_id))


def _require_membership(db: Session, user: User) -> GuildMember:
    member = _membership(db, user.id)
    if not member:
        raise HTTPException(403, "not in a guild")
    return member


def _require_officer(member: GuildMember) -> GuildMember:
    if member.role not in ("owner", "officer"):
        raise HTTPException(403, "only owner or officer may do this")
    return member


def week_key(ts: float | None = None) -> str:
    stamp = dt.datetime.fromtimestamp(ts or time.time(), dt.timezone.utc).isocalendar()
    return f"{stamp[0]}-W{stamp[1]:02d}"


# ── Gilden ───────────────────────────────────────────────────────────
class GuildCreateIn(BaseModel):
    name: str = Field(min_length=3, max_length=64)
    tag: str = Field(default="", max_length=8)
    motto: str = Field(default="", max_length=160)


def _guild_payload(db: Session, guild: Guild, me: User) -> dict:
    rows = db.execute(
        select(GuildMember, User).join(User, User.id == GuildMember.user_id)
        .where(GuildMember.guild_id == guild.id)
        .order_by(GuildMember.joined, GuildMember.id)
    ).all()
    stamp = time.time()
    profiles = {
        profile.user_id: profile
        for profile in db.scalars(select(SocialProfile).where(
            SocialProfile.user_id.in_([user.id for _, user in rows])
        )).all()
    } if rows else {}
    members = []
    for gm, user in rows:
        profile = profiles.get(user.id)
        last_seen = max(gm.last_seen, profile.last_seen if profile else 0)
        members.append({
            "uid": user.uid_tag, "username": user.username, "role": gm.role,
            "joined": gm.joined, "lastSeen": last_seen,
            "online": (stamp - last_seen) < PRESENCE_WINDOW,
            "characterPath": profile.character_path if profile else "",
            "activePlan": profile.active_plan if profile else "",
            "activityLabel": profile.activity_label if profile else "",
            "activityAt": profile.activity_at if profile else 0,
            "streak": profile.streak if profile else 0,
            "me": user.id == me.id,
        })
    return {
        "id": guild.id, "name": guild.name, "tag": guild.tag, "motto": guild.motto,
        # Öffentliche uid statt interner Zeilen-ID.
        "owner": next((m["uid"] for m in members if m["role"] == "owner"), ""),
        "created": guild.created, "members": members,
        "memberCount": len(members),
        "onlineCount": sum(1 for m in members if m["online"]),
    }


@router.post("/guild")
def guild_create(body: GuildCreateIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    if _membership(db, user.id):
        raise HTTPException(409, "already in a guild")
    guild = Guild(name=body.name.strip(), tag=body.tag.strip(),
                  motto=body.motto.strip(), owner_id=user.id)
    db.add(guild)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "guild name taken")
    db.add(GuildMember(guild_id=guild.id, user_id=user.id, role="owner"))
    db.commit()
    return _guild_payload(db, guild, user)


@router.get("/guild")
def guild_get(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    member = _membership(db, user.id)
    if not member:
        return {"guild": None}
    member.last_seen = time.time()
    db.commit()
    guild = db.get(Guild, member.guild_id)
    if not guild:
        raise HTTPException(404, "guild missing")
    return {"guild": _guild_payload(db, guild, user)}


@router.post("/guild/leave")
def guild_leave(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    member = _require_membership(db, user)
    guild_id, was_owner = member.guild_id, member.role == "owner"
    # Vom Ausscheidenden erzeugte Codes verlieren ihre Gültigkeit — sonst
    # bliebe ein Zutrittsrecht bestehen, das niemand zurücknehmen kann.
    db.query(GuildInvite).filter(
        GuildInvite.created_by == user.id, GuildInvite.guild_id == guild_id
    ).delete(synchronize_session=False)
    db.delete(member)
    db.commit()

    successor = db.scalar(
        select(GuildMember).where(GuildMember.guild_id == guild_id)
        .order_by(GuildMember.joined, GuildMember.id)
    )
    if successor is None:
        db.query(GuildInvite).filter(GuildInvite.guild_id == guild_id).delete(synchronize_session=False)
        guild = db.get(Guild, guild_id)
        if guild:
            db.delete(guild)
        db.commit()
        return {"ok": True, "disbanded": True}

    # Ohne Nachfolge könnte niemand mehr einladen oder Raids starten.
    if was_owner:
        successor.role = "owner"
        guild = db.get(Guild, guild_id)
        if guild:
            guild.owner_id = successor.user_id
        db.commit()
    return {"ok": True, "disbanded": False}


@router.post("/guild/invite")
def guild_invite(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    member = _require_officer(_require_membership(db, user))
    code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(8))
    invite = GuildInvite(guild_id=member.guild_id, code=code, created_by=user.id,
                         expires=time.time() + 7 * 86400, uses_left=25)
    db.add(invite)
    db.commit()
    return {"code": code, "expires": invite.expires, "usesLeft": invite.uses_left}


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.post("/guild/join", dependencies=[Depends(_rate_limit(_join_limiter, "guild-join"))])
def guild_join(body: JoinIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    if _membership(db, user.id):
        raise HTTPException(409, "already in a guild")
    invite = db.scalar(select(GuildInvite).where(GuildInvite.code == body.code.strip().upper()))
    if not invite:
        raise HTTPException(404, "invalid code")
    if invite.uses_left <= 0 or (invite.expires and invite.expires < time.time()):
        raise HTTPException(410, "code expired")
    if not db.get(Guild, invite.guild_id):
        raise HTTPException(410, "guild no longer exists")
    issuer = db.scalar(select(GuildMember).where(
        GuildMember.user_id == invite.created_by, GuildMember.guild_id == invite.guild_id))
    if not issuer or issuer.role not in ("owner", "officer"):
        raise HTTPException(410, "code revoked")
    # Atomar herunterzählen, sonst liesse sich das Nutzungslimit unterlaufen.
    used = db.query(GuildInvite).filter(
        GuildInvite.id == invite.id, GuildInvite.uses_left > 0
    ).update({"uses_left": GuildInvite.uses_left - 1}, synchronize_session=False)
    if not used:
        db.rollback()
        raise HTTPException(410, "code expired")
    db.add(GuildMember(guild_id=invite.guild_id, user_id=user.id, role="member"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "already a member")
    return _guild_payload(db, db.get(Guild, invite.guild_id), user)


# ── Geräteübergreifender Sync ────────────────────────────────────────
class SyncPushIn(BaseModel):
    payload: dict
    baseRev: int = 0
    device: str = Field(default="", max_length=64)


@router.get("/sync")
def sync_pull(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    blob = db.get(SyncBlob, user.id)
    if not blob:
        return {"rev": 0, "payload": None, "updated": 0}
    return {"rev": blob.rev, "payload": json.loads(blob.payload or "{}"),
            "updated": blob.updated, "device": blob.device}


@router.post("/sync", dependencies=[Depends(_rate_limit(_sync_limiter, "sync"))])
def sync_push(body: SyncPushIn, user: User = Depends(current_user),
              db: Session = Depends(get_db)) -> dict:
    raw = json.dumps(body.payload)
    if len(raw) > MAX_SYNC_BYTES:
        raise HTTPException(413, "sync payload too large")
    if len(body.payload) > MAX_SYNC_KEYS:
        raise HTTPException(413, "too many sync keys")

    blob = db.get(SyncBlob, user.id)
    if not blob:
        db.add(SyncBlob(user_id=user.id, payload=raw, rev=1, device=body.device))
        db.commit()
        return {"ok": True, "rev": 1}
    # Konflikt sichtbar machen statt fremde Änderungen zu überschreiben.
    if body.baseRev != blob.rev:
        return {"ok": False, "conflict": True, "rev": blob.rev,
                "payload": json.loads(blob.payload or "{}"), "device": blob.device}
    blob.payload = raw
    blob.rev += 1
    blob.updated = time.time()
    blob.device = body.device
    db.commit()
    return {"ok": True, "rev": blob.rev}


# ── Raids ────────────────────────────────────────────────────────────
RAID_KINDS = ("volume", "consistency", "sessions")
RAID_DEFAULT_GOAL = {"volume": 6000, "consistency": 20, "sessions": 12}


class RaidStartIn(BaseModel):
    kind: str = Field(default="volume")
    goal: int = Field(default=0, ge=0, le=1_000_000)


class ContributeIn(BaseModel):
    """Absolutwert der Woche, kein Delta — Wiederholungen bleiben idempotent."""
    value: int = Field(ge=0, le=1_000_000)


def _raid_payload(db: Session, raid: Raid, me: User) -> dict:
    rows = db.execute(
        select(RaidContribution, User).join(User, User.id == RaidContribution.user_id)
        .where(RaidContribution.raid_id == raid.id)
        .order_by(RaidContribution.value.desc(), User.id)
    ).all()
    total = sum(c.value for c, _ in rows)
    return {
        "id": raid.id, "kind": raid.kind, "weekKey": raid.week_key, "goal": raid.goal,
        "total": total,
        "pct": min(100, round(total / raid.goal * 100)) if raid.goal else 0,
        "contributors": [
            {"uid": u.uid_tag, "username": u.username, "value": c.value, "me": u.id == me.id}
            for c, u in rows
        ],
    }


@router.get("/raid")
def raid_current(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    member = _require_membership(db, user)
    raid = db.scalar(select(Raid).where(
        Raid.guild_id == member.guild_id, Raid.week_key == week_key()))
    if not raid:
        return {"raid": None, "weekKey": week_key()}
    return {"raid": _raid_payload(db, raid, user)}


@router.post("/raid")
def raid_start(body: RaidStartIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    member = _require_officer(_require_membership(db, user))
    kind = body.kind if body.kind in RAID_KINDS else "volume"
    members = db.scalar(select(func.count(GuildMember.id))
                        .where(GuildMember.guild_id == member.guild_id)) or 1
    goal = body.goal or RAID_DEFAULT_GOAL[kind] * members
    raid = Raid(guild_id=member.guild_id, kind=kind, week_key=week_key(), goal=goal)
    db.add(raid)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Raid).where(
            Raid.guild_id == member.guild_id, Raid.week_key == week_key()))
        return {"raid": _raid_payload(db, existing, user), "existing": True}
    return {"raid": _raid_payload(db, raid, user)}


@router.post("/raid/contribute")
def raid_contribute(body: ContributeIn, user: User = Depends(current_user),
                    db: Session = Depends(get_db)) -> dict:
    member = _require_membership(db, user)
    raid = db.scalar(select(Raid).where(
        Raid.guild_id == member.guild_id, Raid.week_key == week_key()))
    if not raid:
        raise HTTPException(404, "no active raid")
    contribution = db.scalar(select(RaidContribution).where(
        RaidContribution.raid_id == raid.id, RaidContribution.user_id == user.id))
    if not contribution:
        db.add(RaidContribution(raid_id=raid.id, user_id=user.id, value=body.value))
    else:
        contribution.value = body.value
        contribution.updated = time.time()
    member.last_seen = time.time()
    db.commit()
    return {"raid": _raid_payload(db, raid, user)}
