"""SQL-Schema: User-Profile, Scan-Historie, Supplement-Protokolle,
Chat-Verläufe und der serverseitige Preis-Cache."""
import time

from sqlalchemy import Float, ForeignKey, Integer, String, Text
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
    uid_tag: Mapped[str] = mapped_column(String(16), default="#000")   # z. B. "#001"
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
    ts: Mapped[float] = mapped_column(Float, default=now, index=True)


class PriceCache(Base):
    __tablename__ = "price_cache"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)  # z. B. "live_prices"
    payload: Mapped[str] = mapped_column(Text, default="{}")
    ts: Mapped[float] = mapped_column(Float, default=now)
