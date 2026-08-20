from __future__ import annotations

import datetime as dt

import pytest
from fastapi import HTTPException

from app.db import Base, SessionLocal, engine
from app.account_api import LoginIn, RegisterIn, login, register
from app.guild_api import (
    ContributeIn,
    GuildCreateIn,
    JoinIn,
    RaidStartIn,
    SyncPushIn,
    guild_create,
    guild_invite,
    guild_join,
    raid_contribute,
    raid_start,
    sync_pull,
    sync_push,
)
from app.models import PushPreference, User
from app.push_service import due_messages
from app.social_api import (
    BuffIn,
    FriendInviteIn,
    FriendRespondIn,
    SocialSnapshotIn,
    friends,
    invite_friend,
    respond_friend,
    send_buff,
    update_social_profile,
)


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def user(db, email: str, name: str, uid: str) -> User:
    row = User(email=email, username=name, uid_tag=uid, pw_hash="test")
    db.add(row)
    db.commit()
    return row


def snapshot(path: str, plan: str, load: int = 62) -> SocialSnapshotIn:
    return SocialSnapshotIn.model_validate({
        "characterPath": path,
        "activePlan": plan,
        "activityKind": "training",
        "activityLabel": "Completed Power Circuit",
        "activityAt": 1_800_000_000,
        "streak": 6,
        "weekly": {"activeDays": 5, "workouts": 4, "volumeKg": 12400, "completedQuests": 7},
        "topLifts": [{"exerciseKey": "squat", "name": "Front squat", "weightKg": 100, "reps": 6}],
        "muscleLoads": {"quads": load, "unknown": 99},
        "achievement": "Quest rank increased",
        "gender": "male",
    })


def test_public_account_creates_stable_uid_and_rejects_duplicate_names(db):
    created = register(RegisterIn(
        email="agent@example.test", username="Agent", password="strong-pass",
    ), db)
    assert created["uid"] == "#001"
    assert login(LoginIn(email="agent@example.test", password="strong-pass"), db)["uid"] == "#001"
    with pytest.raises(HTTPException) as duplicate:
        register(RegisterIn(
            email="other@example.test", username="agent", password="other-pass",
        ), db)
    assert duplicate.value.status_code == 409


def test_real_friend_invite_presence_profile_and_buff(db):
    first = user(db, "first@example.test", "First", "#101")
    second = user(db, "second@example.test", "Second", "#102")
    update_social_profile(snapshot("toji", "Toji Power"), first, db)
    update_social_profile(snapshot("goku", "Goku Volume", 71), second, db)

    invite = invite_friend(FriendInviteIn(identifier="#102"), first, db)
    incoming = friends(second, db)
    assert incoming["incoming"][0]["id"] == invite["id"]

    respond_friend(FriendRespondIn(friendshipId=invite["id"], action="accept"), second, db)
    roster = friends(first, db)
    assert roster["friends"][0]["username"] == "Second"
    assert roster["friends"][0]["characterPath"] == "goku"
    assert roster["friends"][0]["online"] is True
    assert roster["friends"][0]["muscleLoads"] == {"quads": 71}

    sent = send_buff(BuffIn(uid="#102", kind="aura"), first, db)
    assert sent["ok"] is True
    received = friends(second, db)
    assert received["buffs"][0]["kind"] == "aura"
    with pytest.raises(HTTPException) as cooldown:
        send_buff(BuffIn(uid="#102", kind="aura"), first, db)
    assert cooldown.value.status_code == 429


def test_guild_invite_raid_and_revisioned_sync(db):
    owner = user(db, "owner@example.test", "Owner", "#201")
    member = user(db, "member@example.test", "Member", "#202")
    guild = guild_create(GuildCreateIn(name="Vanguard", tag="VGD", motto="Consistent"), owner, db)
    assert guild["memberCount"] == 1
    code = guild_invite(owner, db)["code"]
    joined = guild_join(JoinIn(code=code), member, db)
    assert joined["memberCount"] == 2

    raid = raid_start(RaidStartIn(kind="sessions", goal=6), owner, db)["raid"]
    assert raid["goal"] == 6
    contribution = raid_contribute(ContributeIn(value=3), member, db)["raid"]
    assert contribution["total"] == 3
    assert contribution["contributors"][0]["username"] == "Member"

    pushed = sync_push(SyncPushIn(payload={"profile": {"goal": "strength"}}, baseRev=0, device="Android"), owner, db)
    assert pushed["rev"] == 1
    assert sync_pull(owner, db)["payload"]["profile"]["goal"] == "strength"
    conflict = sync_push(SyncPushIn(payload={"profile": {}}, baseRev=0, device="Other"), owner, db)
    assert conflict["conflict"] is True


def test_push_due_messages_respect_quiet_hours_snooze_and_streak():
    now = dt.datetime(2026, 8, 20, 20, 45, tzinfo=dt.timezone.utc).timestamp()
    preference = PushPreference(
        user_id=1, enabled=1, training=1, recovery=0, supplements=0,
        streak_rescue=1, training_time="18:00", quiet_start="22:00",
        quiet_end="07:00", timezone="UTC", snoozed_until=0,
    )
    messages = due_messages(preference, {"streak": {"count": 5}, "train_sessions": []}, now)
    assert {key.split(":")[0] for key, _ in messages} == {"training", "streak"}

    preference.snoozed_until = now + 60
    assert due_messages(preference, {"streak": {"count": 5}}, now) == []
    preference.snoozed_until = 0
    quiet = dt.datetime(2026, 8, 20, 23, 0, tzinfo=dt.timezone.utc).timestamp()
    assert due_messages(preference, {"streak": {"count": 5}}, quiet) == []


def test_push_checks_synced_meals_hydration_and_unfinished_sets_without_guessing():
    now = dt.datetime(2026, 8, 20, 20, 45, tzinfo=dt.timezone.utc).timestamp()
    preference = PushPreference(
        user_id=1, enabled=1, training=0, recovery=0, supplements=0,
        hydration=1, meals=1, unfinished_sets=1, streak_rescue=0,
        quiet_start="22:00", quiet_end="07:00", timezone="UTC", snoozed_until=0,
    )
    payload = {
        "mana_2026-08-20": 1,
        "food_2026-08-20": [],
        "train_session_drafts": {"toji": {"completedSets": {"0": [True, False]}}},
    }
    kinds = {key.split(":")[0] for key, _ in due_messages(preference, payload, now)}
    assert kinds == {"hydration", "meal", "unfinished"}

    payload["mana_2026-08-20"] = 3
    payload["food_2026-08-20"] = [{"name": "Lunch"}]
    payload["train_session_drafts"] = {"toji": {"completedSets": {"0": [True, True]}}}
    assert due_messages(preference, payload, now) == []
