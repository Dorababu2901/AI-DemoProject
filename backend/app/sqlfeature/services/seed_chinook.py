"""Download/seed the Chinook SQLite database for out-of-the-box demos."""
from __future__ import annotations

import os
import urllib.request
from pathlib import Path

# Official Chinook SQLite (lerocha/chinook-database) — small, public-domain demo DB.
CHINOOK_URL = (
    "https://github.com/lerocha/chinook-database/raw/master/"
    "ChinookDatabase/DataSources/Chinook_Sqlite.sqlite"
)


def ensure_chinook(path: str | os.PathLike) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.stat().st_size > 0:
        return p
    print(f"[seed] downloading Chinook to {p} ...")
    urllib.request.urlretrieve(CHINOOK_URL, p)
    print(f"[seed] done ({p.stat().st_size} bytes)")
    return p


if __name__ == "__main__":
    ensure_chinook(Path(__file__).resolve().parent.parent.parent.parent / "data" / "chinook.db")
