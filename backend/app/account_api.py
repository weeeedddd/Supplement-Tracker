"""Small account boundary used by Guild, friends, sync, and Web Push."""
from __future__ import annotations

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuthToken, User

router = APIRouter(prefix="/api/auth", tags=["account"])


def _hash_password(password: str, salt: bytes | None = None) -> str:
    actual_salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), actual_salt, 210_000)
    return f"{actual_salt.hex()}:{derived.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 210_000)
        return secrets.compare_digest(derived.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


class RegisterIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)


def _token(db: Session, user: User) -> dict:
    token = secrets.token_hex(32)
    db.add(AuthToken(user_id=user.id, token=token))
    db.commit()
    return {"token": token, "uid": user.uid_tag, "username": user.username}


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    username = " ".join(body.username.strip().split())
    if not username:
        raise HTTPException(422, "name required")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "email already registered")
    if db.scalar(select(User.id).where(User.username.ilike(username))):
        raise HTTPException(409, "username already registered")
    user = User(
        email=email, username=username,
        pw_hash=_hash_password(body.password), uid_tag=f"pending-{secrets.token_hex(3)}",
    )
    db.add(user)
    try:
        db.flush()
        user.uid_tag = f"#{user.id:03d}"
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "email already registered") from exc
    return _token(db, user)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not _check_password(body.password, user.pw_hash):
        raise HTTPException(401, "invalid credentials")
    return _token(db, user)
