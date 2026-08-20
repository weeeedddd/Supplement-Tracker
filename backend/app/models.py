"""SQL-Schema: User-Profile, Scan-Historie, Supplement-Protokolle,
Chat-Verläufe und der serverseitige Preis-Cache."""
import time

from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> float:
    return time.time()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(80))
    pw_hash: Mapped[str] = mapped_column(String(255))
    uid_tag: Mapped[str] = mapped_column(String(16), unique=True, index=True, default="#000")   # z. B. "#001"
    created: Mapped[float] = mapped_column(Float, default=now)
    # Profil (Onboarding)
    first_name: Mapped[str] = mapped_column(String(80), default="")
    age: Mapped[int] = mapped_column(Integer, default=0)
    height_cm: Mapped[float] = mapped_column(Float, default=0)
    weight_kg: Mapped[float] = mapped_column(Float, default=0)
    gender: Mapped[str] = mapped_column(String(4), default="")
    goal: Mapped[str] = mapped_column(String(16), default="")
    # Supplement-Protokoll + Makro-Ziele als JSON-Snapshot
    protocol_json: Mapped[str] = mapped_column(Text, default="[]")
    macros_json: Mapped[str] = mapped_column(Text, default="{}")


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created: Mapped[float] = mapped_column(Float, default=now)


class ScanEntry(Base):
    __tablename__ = "scan_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    uid_tag: Mapped[str] = mapped_column(String(16), index=True)   # lokale User-ID (#001) oder "anon"
    name: Mapped[str] = mapped_column(String(255))
    kcal: Mapped[int] = mapped_column(Integer, default=0)
    prot: Mapped[int] = mapped_column(Integer, default=0)
    carb: Mapped[int] = mapped_column(Integer, default=0)
    fat: Mapped[int] = mapped_column(Integer, default=0)
    sug: Mapped[int] = mapped_column(Integer, default=0)
    ts: Mapped[float] = mapped_column(Float, default=now, index=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    room: Mapped[str] = mapped_column(String(24), index=True)      # global | de | en | ja | ko | es
    user: Mapped[str] = mapped_column(String(80))
    uid_tag: Mapped[str] = mapped_column(String(16), default="#000")
    text: Mapped[str] = mapped_column(Text, default="")
    media: Mapped[str] = mapped_column(String(512), default="")    # /media/<datei> oder ""
    meta: Mapped[str] = mapped_column(Text, default="")            # JSON-Payload (z. B. geteiltes Rezept)
    ts: Mapped[float] = mapped_column(Float, default=now, index=True)


class PriceCache(Base):
    __tablename__ = "price_cache"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)  # z. B. "live_prices"
    payload: Mapped[str] = mapped_column(Text, default="{}")
    ts: Mapped[float] = mapped_column(Float, default=now)


class UserStats(Base):
    """RPG-Snapshot pro Chat-User (Level, Attribute, Titel, Streak).
    Client-seitig berechnet und via /api/profile/sync gespiegelt — der
    Shadow Bot liest hieraus für !profile / !stats."""
    __tablename__ = "user_stats"
    uid_tag: Mapped[str] = mapped_column(String(16), primary_key=True)   # #001 …
    name: Mapped[str] = mapped_column(String(80), default="")
    rank: Mapped[str] = mapped_column(String(48), default="Shadow Novice")
    xp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    attrs_json: Mapped[str] = mapped_column(Text, default="{}")          # {STR,VIT,AGI,INT,MAG}
    achievements: Mapped[int] = mapped_column(Integer, default=0)
    titles: Mapped[int] = mapped_column(Integer, default=0)
    equipped_title: Mapped[str] = mapped_column(String(48), default="")
    streak: Mapped[int] = mapped_column(Integer, default=0)
    ts: Mapped[float] = mapped_column(Float, default=now)


# ═══════════════════════════════════════════════════════════════════
#  ◈ AGENT TRAINING PROTOCOLS & MATERIA FUEL
#  Ernährungs-DB (Gerichte + User-Rezepte), Trainingspläne mit
#  Übungen, und temporäre Stat-Buffs (Mega-Feature).
# ═══════════════════════════════════════════════════════════════════
class Dish(Base):
    """Gericht mit exakten Nährwerten. is_preset=1 → mitgeliefert,
    sonst User-Rezept (owner_uid gesetzt)."""
    __tablename__ = "dishes"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    category: Mapped[str] = mapped_column(String(24), default="main")    # breakfast|main|dessert|snack
    ingredients: Mapped[str] = mapped_column(Text, default="")           # eine Zutat pro Zeile
    steps: Mapped[str] = mapped_column(Text, default="")                 # ein Zubereitungsschritt pro Zeile
    prep_min: Mapped[int] = mapped_column(Integer, default=0)
    kcal: Mapped[int] = mapped_column(Integer, default=0)
    prot: Mapped[int] = mapped_column(Integer, default=0)
    carb: Mapped[int] = mapped_column(Integer, default=0)
    fat: Mapped[int] = mapped_column(Integer, default=0)
    equipment: Mapped[str] = mapped_column(String(64), default="")       # csv: airfryer,ricecooker,stove,none
    icon: Mapped[str] = mapped_column(String(8), default="🍽")
    image: Mapped[str] = mapped_column(String(512), default="")          # Rezeptbild (Unsplash / URL)
    i18n: Mapped[str] = mapped_column(Text, default="{}")                # JSON: {en:{name,ingredients,steps}, tr:{…}}
    is_preset: Mapped[int] = mapped_column(Integer, default=0)
    owner_uid: Mapped[str] = mapped_column(String(16), default="", index=True)
    ts: Mapped[float] = mapped_column(Float, default=now)


class WorkoutPlan(Base):
    """Trainingsplan (Split / Ganzkörper). Übungen als JSON-Liste
    [{name,sets,reps,weight,rest}] — kompakt & flexibel."""
    __tablename__ = "workout_plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    kind: Mapped[str] = mapped_column(String(24), default="split")       # split|fullbody|push|pull|legs
    focus: Mapped[str] = mapped_column(String(80), default="")
    exercises_json: Mapped[str] = mapped_column(Text, default="[]")
    icon: Mapped[str] = mapped_column(String(8), default="🏋")
    is_preset: Mapped[int] = mapped_column(Integer, default=0)
    owner_uid: Mapped[str] = mapped_column(String(16), default="", index=True)
    ts: Mapped[float] = mapped_column(Float, default=now)


class StatBuff(Base):
    """Temporärer Attribut-Boost, ausgelöst durch geloggte Mahlzeit
    oder Workout. Läuft nach expires_at ab."""
    __tablename__ = "stat_buffs"
    id: Mapped[int] = mapped_column(primary_key=True)
    uid_tag: Mapped[str] = mapped_column(String(16), index=True)
    source: Mapped[str] = mapped_column(String(16), default="meal")      # meal|workout
    label: Mapped[str] = mapped_column(String(80), default="")
    icon: Mapped[str] = mapped_column(String(8), default="⚡")
    boosts_json: Mapped[str] = mapped_column(Text, default="{}")         # {STR:+10,VIT:+10}
    created: Mapped[float] = mapped_column(Float, default=now)
    expires_at: Mapped[float] = mapped_column(Float, default=now, index=True)


# ═══ GILDEN · SYNC · RAIDS ════════════════════════════════════════════
class Guild(Base):
    __tablename__ = "guilds"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tag: Mapped[str] = mapped_column(String(8), default="")
    motto: Mapped[str] = mapped_column(String(160), default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created: Mapped[float] = mapped_column(Float, default=now)


class GuildMember(Base):
    __tablename__ = "guild_members"
    __table_args__ = (
        UniqueConstraint("guild_id", "user_id", name="uq_guild_user"),
        # Eine Mitgliedschaft je Nutzer — auf DB-Ebene, damit gleichzeitige
        # Beitritte nicht in zwei Gilden gleichzeitig enden.
        UniqueConstraint("user_id", name="uq_member_single_guild"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(12), default="member")   # owner | officer | member
    joined: Mapped[float] = mapped_column(Float, default=now)
    last_seen: Mapped[float] = mapped_column(Float, default=now)


class GuildInvite(Base):
    __tablename__ = "guild_invites"
    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), index=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created: Mapped[float] = mapped_column(Float, default=now)
    expires: Mapped[float] = mapped_column(Float, default=0)
    uses_left: Mapped[int] = mapped_column(Integer, default=25)


class SyncBlob(Base):
    """Geräteübergreifender Datenstand eines Nutzers.

    Der Server speichert den Blob undurchsichtig. `rev` erlaubt dem Client,
    konkurrierende Schreibzugriffe zu erkennen, statt sie stillschweigend
    zu überschreiben.
    """
    __tablename__ = "sync_blobs"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, default="{}")
    rev: Mapped[int] = mapped_column(Integer, default=1)
    updated: Mapped[float] = mapped_column(Float, default=now)
    device: Mapped[str] = mapped_column(String(64), default="")


class Raid(Base):
    __tablename__ = "raids"
    __table_args__ = (UniqueConstraint("guild_id", "week_key", name="uq_raid_week"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="volume")   # volume | consistency | sessions
    week_key: Mapped[str] = mapped_column(String(10), index=True)     # ISO-Woche, z. B. "2026-W34"
    goal: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[float] = mapped_column(Float, default=now)


class RaidContribution(Base):
    __tablename__ = "raid_contributions"
    __table_args__ = (UniqueConstraint("raid_id", "user_id", name="uq_raid_user"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    value: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[float] = mapped_column(Float, default=now)


# ═══ FREUNDE · LIVE-PROFILE · AURA ═══════════════════════════════════
class Friendship(Base):
    """One normalized relationship row per pair of real accounts.

    ``user_a_id`` is always the smaller id. ``requested_by_id`` preserves
    who sent the request without allowing the reverse direction to create a
    second row for the same pair.
    """

    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", name="uq_friend_pair"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_a_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    user_b_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | accepted
    created: Mapped[float] = mapped_column(Float, default=now)
    updated: Mapped[float] = mapped_column(Float, default=now)


class SocialProfile(Base):
    """Small, user-controlled snapshot visible only to accepted friends."""

    __tablename__ = "social_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    character_path: Mapped[str] = mapped_column(String(24), default="")
    active_plan: Mapped[str] = mapped_column(String(120), default="")
    activity_kind: Mapped[str] = mapped_column(String(16), default="active")
    activity_label: Mapped[str] = mapped_column(String(160), default="")
    activity_at: Mapped[float] = mapped_column(Float, default=now)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    weekly_json: Mapped[str] = mapped_column(Text, default="{}")
    lifts_json: Mapped[str] = mapped_column(Text, default="[]")
    muscle_json: Mapped[str] = mapped_column(Text, default="{}")
    achievement: Mapped[str] = mapped_column(String(180), default="")
    gender: Mapped[str] = mapped_column(String(8), default="")
    last_seen: Mapped[float] = mapped_column(Float, default=now, index=True)
    updated: Mapped[float] = mapped_column(Float, default=now)


class SocialBuff(Base):
    __tablename__ = "social_buffs"
    id: Mapped[int] = mapped_column(primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="aura")  # aura | focus
    created: Mapped[float] = mapped_column(Float, default=now, index=True)
    seen: Mapped[int] = mapped_column(Integer, default=0)


# ═══ WEB-PUSH ════════════════════════════════════════════════════════
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(180))
    auth: Mapped[str] = mapped_column(String(180))
    created: Mapped[float] = mapped_column(Float, default=now)
    updated: Mapped[float] = mapped_column(Float, default=now)
    last_success: Mapped[float] = mapped_column(Float, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)


class PushPreference(Base):
    __tablename__ = "push_preferences"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    enabled: Mapped[int] = mapped_column(Integer, default=0)
    training: Mapped[int] = mapped_column(Integer, default=1)
    recovery: Mapped[int] = mapped_column(Integer, default=1)
    supplements: Mapped[int] = mapped_column(Integer, default=0)
    hydration: Mapped[int] = mapped_column(Integer, default=0)
    meals: Mapped[int] = mapped_column(Integer, default=0)
    unfinished_sets: Mapped[int] = mapped_column(Integer, default=1)
    streak_rescue: Mapped[int] = mapped_column(Integer, default=1)
    training_time: Mapped[str] = mapped_column(String(5), default="18:00")
    supplement_time: Mapped[str] = mapped_column(String(5), default="09:00")
    quiet_start: Mapped[str] = mapped_column(String(5), default="22:00")
    quiet_end: Mapped[str] = mapped_column(String(5), default="07:00")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    snoozed_until: Mapped[float] = mapped_column(Float, default=0)
    updated: Mapped[float] = mapped_column(Float, default=now)


class PushDelivery(Base):
    __tablename__ = "push_deliveries"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_push_delivery"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(96))
    sent_at: Mapped[float] = mapped_column(Float, default=now, index=True)
