"""Serve generated images stored under backend/storage/images/."""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser

router = APIRouter(prefix="/images", tags=["images"])

# storage/images/ at the backend root.
IMAGES_DIR = Path(__file__).resolve().parents[2] / "storage" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Only allow safe filenames (uuid-like + extension) to defend against traversal.
_FILENAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}\.(png|jpg|jpeg|webp)$")


@router.get("/{filename}")
def get_image(filename: str, _user: CurrentUser) -> FileResponse:
    if not _FILENAME_RE.match(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image filename.",
        )
    path = IMAGES_DIR / filename
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found.",
        )
    return FileResponse(path)
