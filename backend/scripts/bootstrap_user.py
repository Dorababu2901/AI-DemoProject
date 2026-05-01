"""Bootstrap / provision a user row by email.

Usage (from c:\\DemoApp\\backend with the venv active):

    .\\.venv\\Scripts\\python.exe -m scripts.bootstrap_user --email you@amzur.com --name "Your Name"

Re-running with the same email is safe (idempotent — updates name/picture only).
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision a user row.")
    parser.add_argument("--email", required=True, help="User's email address.")
    parser.add_argument("--name", default=None, help="Full name (optional).")
    parser.add_argument("--picture", default=None, help="Picture URL (optional).")
    parser.add_argument(
        "--inactive", action="store_true", help="Create the user as inactive."
    )
    args = parser.parse_args()

    email = args.email.strip().lower()
    if "@" not in email:
        print(f"error: '{email}' does not look like an email", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=args.name,
                picture_url=args.picture,
                is_active=not args.inactive,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"created user {user.id} <{user.email}>")
        else:
            changed = False
            if args.name and user.full_name != args.name:
                user.full_name = args.name
                changed = True
            if args.picture and user.picture_url != args.picture:
                user.picture_url = args.picture
                changed = True
            if args.inactive and user.is_active:
                user.is_active = False
                changed = True
            if changed:
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"updated user {user.id} <{user.email}>")
            else:
                print(f"user already exists: {user.id} <{user.email}>")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
