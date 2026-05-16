"""Quick smoke test for the Google Sheets loader.

Usage (from backend/ with venv active):
    python -m scripts._check_sheets <google-sheet-url-or-id> [worksheet-name]

The Sheet must be shared with the service-account email shown in the error
message if access is denied.
"""
from __future__ import annotations

import sys

from dotenv import load_dotenv

load_dotenv()

from app.sheetsfeature.services.sheets_service import (  # noqa: E402
    SheetsAccessError,
    SheetsAuthError,
    load_sheet_as_dataframe,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    url = sys.argv[1]
    ws = sys.argv[2] if len(sys.argv) > 2 else None
    try:
        df = load_sheet_as_dataframe(url, worksheet=ws)
    except SheetsAuthError as e:
        print(f"AUTH ERROR: {e}")
        return 1
    except SheetsAccessError as e:
        print(f"ACCESS ERROR: {e}")
        if e.service_account_email:
            print(f"  Share the sheet with: {e.service_account_email}")
        return 1
    print(f"OK — {len(df)} rows, columns: {df.columns.tolist()}")
    print(df.head())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
