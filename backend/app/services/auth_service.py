"""Auth service: JWT creation, cookie helpers, Google user lookup/linking."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, Response, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User


def create_access_token(subject: str) -> str:
    """Sign a short-lived JWT whose `sub` is the user UUID (string)."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def set_auth_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        domain=settings.auth_cookie_domain,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        domain=settings.auth_cookie_domain,
    )


def find_or_link_google_user(
    db: Session,
    *,
    email: str,
    google_sub: str,
    full_name: str | None = None,
    picture_url: str | None = None,
) -> User:
    """Look up a user by email and link the Google subject id.

    Per the auth spec: never create a duplicate user. If no user exists
    with the given email, raise 403 — the account must be pre-provisioned.
    """
    settings = get_settings()
    email = email.lower().strip()

    allowed = settings.allowed_email_domains_list
    if allowed and not any(email.endswith("@" + d) for d in allowed):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain is not allowed.",
        )

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No Amzur account is provisioned for this email.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    # Link the Google subject id on first sign-in (never overwrite a different one).
    changed = False
    if user.google_sub is None:
        user.google_sub = google_sub
        changed = True
    elif user.google_sub != google_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is linked to a different Google account.",
        )

    # Opportunistically refresh profile fields if they were empty.
    if full_name and not user.full_name:
        user.full_name = full_name
        changed = True
    if picture_url and not user.picture_url:
        user.picture_url = picture_url
        changed = True

    if changed:
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_user_by_id(db: Session, user_id: str) -> User | None:
    try:
        uid = UUID(user_id)
    except (ValueError, TypeError):
        return None
    return db.get(User, uid)
