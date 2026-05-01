"""Authentication routes.

Note: This is a minimal scaffold. Replace the in-memory credential
check with a real user store + password hashing before production use.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from jose import jwt

from app.core.config import get_settings
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


# TEMPORARY demo credentials. Replace with DB-backed user lookup.
_DEMO_USERS = {"admin": "admin"}


def _create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    expected = _DEMO_USERS.get(payload.username)
    if expected is None or expected != payload.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = _create_access_token(subject=payload.username)
    return LoginResponse(access_token=token)
