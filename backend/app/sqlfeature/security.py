"""Fernet helper for SQL-feature secrets.

Derives a deterministic key from DemoApp's existing JWT secret so we don't
need yet another environment variable. If you rotate JWT_SECRET_KEY you'll
need to re-add saved connections.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _key() -> bytes:
    secret = (get_settings().jwt_secret_key or "dev-fallback").encode()
    digest = hashlib.sha256(b"sqlfeature::" + secret).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(plaintext: str) -> str:
    return Fernet(_key()).encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return Fernet(_key()).decrypt(ciphertext.encode()).decode()
