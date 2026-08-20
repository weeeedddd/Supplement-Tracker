"""Server-side Web Push queue for reminders while CORELINE is closed.

The worker is intentionally explicit: a deployment runs ``python -m
app.push_worker`` every few minutes (or calls the protected process endpoint).
Nothing is sent unless a user enabled push, a subscription exists and VAPID
credentials are configured.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import PushDelivery, PushPreference, PushSubscription, SyncBlob


def push_configured() -> bool:
    return bool(
        os.environ.get("VAPID_PUBLIC_KEY", "").strip()
        and os.environ.get("VAPID_PRIVATE_KEY", "").strip()
        and os.environ.get("VAPID_SUBJECT", "").strip()
    )


def _clock(value: str, fallback: tuple[int, int]) -> tuple[int, int]:
    try:
        hour, minute = (int(part) for part in value.split(":", 1))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
    except (TypeError, ValueError):
        pass
    return fallback


def _timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _in_quiet_hours(local_now: dt.datetime, start: str, end: str) -> bool:
    current = local_now.hour * 60 + local_now.minute
    start_hour, start_minute = _clock(start, (22, 0))
    end_hour, end_minute = _clock(end, (7, 0))
    quiet_start = start_hour * 60 + start_minute
    quiet_end = end_hour * 60 + end_minute
    if quiet_start == quiet_end:
        return False
    if quiet_start < quiet_end:
        return quiet_start <= current < quiet_end
    return current >= quiet_start or current < quiet_end


def _after(local_now: dt.datetime, value: str, fallback: tuple[int, int]) -> bool:
    hour, minute = _clock(value, fallback)
    return (local_now.hour, local_now.minute) >= (hour, minute)


def _sync_payload(blob: SyncBlob | None) -> dict:
    try:
        payload = json.loads(blob.payload or "{}") if blob else {}
        return payload if isinstance(payload, dict) else {}
    except (TypeError, ValueError):
        return {}


def _session_today(payload: dict, local_now: dt.datetime) -> bool:
    sessions = payload.get("train_sessions")
    if not isinstance(sessions, list):
        return False
    for session in sessions:
        if not isinstance(session, dict):
            continue
        try:
            completed = dt.datetime.fromtimestamp(float(session.get("completedAt", 0)) / 1000, local_now.tzinfo)
        except (TypeError, ValueError, OSError):
            continue
        if completed.date() == local_now.date():
            return True
    return False


def _latest_session(payload: dict) -> tuple[float, str] | None:
    sessions = payload.get("train_sessions")
    if not isinstance(sessions, list):
        return None
    latest: tuple[float, str] | None = None
    for session in sessions:
        if not isinstance(session, dict):
            continue
        try:
            stamp = float(session.get("completedAt", 0)) / 1000
        except (TypeError, ValueError):
            continue
        if stamp > 0 and (latest is None or stamp > latest[0]):
            latest = (stamp, str(session.get("name") or "Training")[:80])
    return latest


def _streak(payload: dict) -> int:
    value = payload.get("streak")
    if isinstance(value, dict):
        value = value.get("count")
    try:
        return max(0, min(10_000, int(value or 0)))
    except (TypeError, ValueError):
        return 0


def _routine_open(payload: dict, local_now: dt.datetime) -> int:
    protocol = payload.get("protocol")
    if not isinstance(protocol, list) or not protocol:
        return 0
    key = f"day_{local_now.date().isoformat()}"
    checked = payload.get(key)
    checked_ids = set(checked) if isinstance(checked, list) else set()
    ids = [item.get("id") for item in protocol if isinstance(item, dict) and isinstance(item.get("id"), str)]
    return sum(1 for item_id in ids if item_id not in checked_ids)


def _food_logged(payload: dict, local_now: dt.datetime) -> bool:
    entries = payload.get(f"food_{local_now.date().isoformat()}")
    return isinstance(entries, list) and bool(entries)


def _hydration_count(payload: dict, local_now: dt.datetime) -> int:
    try:
        return max(0, int(payload.get(f"mana_{local_now.date().isoformat()}") or 0))
    except (TypeError, ValueError):
        return 0


def _has_unfinished_sets(payload: dict) -> bool:
    drafts = payload.get("train_session_drafts")
    if not isinstance(drafts, dict):
        return False
    for draft in drafts.values():
        completed = draft.get("completedSets") if isinstance(draft, dict) else None
        if not isinstance(completed, dict):
            continue
        for sets in completed.values():
            if isinstance(sets, list) and any(done is not True for done in sets):
                return True
    return False


def due_messages(
    preference: PushPreference,
    payload: dict,
    now: float | None = None,
) -> list[tuple[str, dict]]:
    stamp = now if now is not None else time.time()
    if not preference.enabled or preference.snoozed_until > stamp:
        return []
    timezone = _timezone(preference.timezone)
    local_now = dt.datetime.fromtimestamp(stamp, timezone)
    if _in_quiet_hours(local_now, preference.quiet_start, preference.quiet_end):
        return []

    day = local_now.date().isoformat()
    trained = _session_today(payload, local_now)
    messages: list[tuple[str, dict]] = []
    if preference.training and not trained and _after(local_now, preference.training_time, (18, 0)):
        messages.append((f"training:{day}", {
            "title": "Character quest ready",
            "body": "Your adaptive character session is waiting. Open CORELINE to review today’s fatigue-adjusted quest.",
            "tag": f"training-{day}", "url": "./?screen=training",
        }))

    if preference.streak_rescue and not trained and _streak(payload) >= 2 and (local_now.hour, local_now.minute) >= (20, 30):
        messages.append((f"streak:{day}", {
            "title": "Streak rescue available",
            "body": "A lighter character quest can preserve consistency without ignoring recovery.",
            "tag": f"streak-{day}", "url": "./?screen=training",
        }))

    if preference.unfinished_sets and _has_unfinished_sets(payload) and (local_now.hour, local_now.minute) >= (20, 15):
        messages.append((f"unfinished:{day}", {
            "title": "Open sets found",
            "body": "A started session still has open sets. Confirm only work you actually completed or resume later.",
            "tag": f"unfinished-{day}", "url": "./?screen=training",
        }))

    if preference.hydration and _hydration_count(payload, local_now) < 2 and (local_now.hour, local_now.minute) >= (14, 0):
        messages.append((f"hydration:{day}", {
            "title": "Hydration check",
            "body": "Little or nothing is marked today. Log only what you actually drank; this is not a medical hydration target.",
            "tag": f"hydration-{day}", "url": "./?screen=dashboard",
        }))

    if preference.meals and not _food_logged(payload, local_now) and (local_now.hour, local_now.minute) >= (13, 30):
        messages.append((f"meal:{day}", {
            "title": "Meal check",
            "body": "No meal is logged today. If you already ate, you can add it now.",
            "tag": f"meal-{day}", "url": "./?screen=fuel",
        }))

    open_items = _routine_open(payload, local_now)
    if preference.supplements and open_items and _after(local_now, preference.supplement_time, (9, 0)):
        messages.append((f"supplements:{day}", {
            "title": "Routine check",
            "body": f"{open_items} tracked routine item{'s are' if open_items != 1 else ' is'} still open. Confirm only what you actually took.",
            "tag": f"supplements-{day}", "url": "./?screen=ki",
        }))

    latest = _latest_session(payload)
    if preference.recovery and latest:
        age_hours = (stamp - latest[0]) / 3600
        recovery_key = dt.datetime.fromtimestamp(latest[0], dt.timezone.utc).strftime("%Y%m%d%H%M")
        if 20 <= age_hours <= 30:
            messages.append((f"recovery:{recovery_key}", {
                "title": "Recovery scan available",
                "body": f"{latest[1]} was about {round(age_hours)} hours ago. Check the heatmap before loading the same muscles hard again.",
                "tag": f"recovery-{recovery_key}", "url": "./?screen=training",
            }))
    return messages[:6]


def _send(subscription: PushSubscription, message: dict) -> tuple[bool, bool]:
    """Return ``(sent, expired)``. Import lazily so the app remains explicit
    about an unconfigured push deployment instead of failing at startup."""
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return False, False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(message, separators=(",", ":")),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
            ttl=3600,
        )
        return True, False
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        return False, status in (404, 410)
    except Exception:
        return False, False


def process_due_pushes(db: Session, now: float | None = None) -> dict:
    if not push_configured():
        return {"configured": False, "users": 0, "sent": 0, "failed": 0, "expired": 0}
    stamp = now if now is not None else time.time()
    preferences = db.scalars(select(PushPreference).where(PushPreference.enabled == 1)).all()
    sent = failed = expired = users = 0
    for preference in preferences:
        subscriptions = db.scalars(select(PushSubscription).where(
            PushSubscription.user_id == preference.user_id
        )).all()
        if not subscriptions:
            continue
        payload = _sync_payload(db.get(SyncBlob, preference.user_id))
        messages = due_messages(preference, payload, stamp)
        if not messages:
            continue
        users += 1
        for dedupe_key, message in messages:
            if db.scalar(select(PushDelivery).where(
                PushDelivery.user_id == preference.user_id,
                PushDelivery.dedupe_key == dedupe_key,
            )):
                continue
            delivered = False
            for subscription in list(subscriptions):
                ok, is_expired = _send(subscription, message)
                if ok:
                    delivered = True
                    sent += 1
                    subscription.last_success = stamp
                    subscription.failure_count = 0
                elif is_expired:
                    expired += 1
                    db.delete(subscription)
                else:
                    failed += 1
                    subscription.failure_count += 1
            if delivered:
                db.add(PushDelivery(user_id=preference.user_id, dedupe_key=dedupe_key, sent_at=stamp))
        db.commit()

    cutoff = stamp - 60 * 86400
    db.query(PushDelivery).filter(PushDelivery.sent_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return {"configured": True, "users": users, "sent": sent, "failed": failed, "expired": expired}
