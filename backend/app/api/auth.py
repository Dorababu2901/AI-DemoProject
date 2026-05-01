"""Authentication routes — demo login, Google OAuth, current user, logout.

JWT is delivered exclusively via an httpOnly cookie. The /login endpoint
also returns the token in the JSON body for backward compatibility but
clients SHOULD rely on the cookie.
"""

from __future__ import annotations

import secrets
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserPublic
from app.services.auth_service import (
    clear_auth_cookie,
    create_access_token,
    find_or_link_google_user,
    set_auth_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_STATE_COOKIE = "oauth_state"

# TEMPORARY demo credentials — kept so the legacy /login path still works.
_DEMO_USERS = {"admin": "admin"}


def _issue_token_for_user(response: Response, user: User) -> str:
    token = create_access_token(subject=str(user.id))
    set_auth_cookie(response, token)
    return token


# --------------------------------------------------------------------------- #
# Demo username/password login (kept for development).                         #
# --------------------------------------------------------------------------- #
@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    expected = _DEMO_USERS.get(payload.username)
    if expected is None or expected != payload.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Find or upsert a placeholder user record so the demo login also issues
    # a JWT bound to a real user UUID (matching the Google flow).
    email = f"{payload.username}@demo.local"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name=payload.username, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = _issue_token_for_user(response, user)
    return LoginResponse(access_token=token)


# --------------------------------------------------------------------------- #
# Google OAuth 2.0                                                             #
# --------------------------------------------------------------------------- #
@router.get("/google/login")
def google_login(response: Response) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    redirect = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    # Short-lived state cookie — verified on callback to defend against CSRF.
    redirect.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )
    return redirect


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    oauth_state: Annotated[str | None, Cookie()] = None,
) -> RedirectResponse:
    settings = get_settings()
    frontend = settings.frontend_url.rstrip("/")

    def _fail(msg: str) -> RedirectResponse:
        resp = RedirectResponse(url=f"{frontend}/login?error={msg}")
        resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return resp

    if error:
        return _fail(error)
    if not code:
        return _fail("missing_code")
    if not state or not oauth_state or not secrets.compare_digest(state, oauth_state):
        return _fail("invalid_state")
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            return _fail("token_exchange_failed")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            return _fail("no_access_token")

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            return _fail("userinfo_failed")
        info = userinfo_resp.json()

    email = info.get("email")
    google_sub = info.get("sub")
    if not email or not google_sub or not info.get("email_verified", False):
        return _fail("email_unverified")

    try:
        user = find_or_link_google_user(
            db,
            email=email,
            google_sub=google_sub,
            full_name=info.get("name"),
            picture_url=info.get("picture"),
        )
    except HTTPException as exc:
        return _fail(f"forbidden_{exc.status_code}")

    redirect = RedirectResponse(url=f"{frontend}/")
    redirect.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    _issue_token_for_user(redirect, user)
    return redirect


# --------------------------------------------------------------------------- #
# Session helpers                                                              #
# --------------------------------------------------------------------------- #
@router.get("/me", response_model=UserPublic)
def me(current_user: CurrentUser) -> User:
    return current_user


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    clear_auth_cookie(response)
    return {"status": "ok"}
