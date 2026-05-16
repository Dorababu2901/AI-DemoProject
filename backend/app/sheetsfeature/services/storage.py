"""Filesystem helpers for storing dataset snapshots."""
from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings


def _backend_root() -> Path:
    # backend/app/sheetsfeature/services/storage.py -> backend/
    return Path(__file__).resolve().parent.parent.parent.parent


def storage_root() -> Path:
    s = get_settings()
    p = Path(s.sheets_storage_dir)
    if not p.is_absolute():
        p = _backend_root() / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def dataset_dir(dataset_id: int) -> Path:
    p = storage_root() / str(dataset_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def parquet_path(dataset_id: int) -> Path:
    return dataset_dir(dataset_id) / "data.parquet"
