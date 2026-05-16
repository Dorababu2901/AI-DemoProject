"""Google Sheets loader using gspread >= 6.x and a service-account JSON.

Set ``GOOGLE_SERVICE_ACCOUNT_JSON`` to the *full JSON string* of the SA key
(not a file path). Share the target Sheet with the SA email as Viewer.
"""
from __future__ import annotations

import json
import re

import pandas as pd

from app.core.config import get_settings

_SHEET_ID_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]+)")


class SheetsAuthError(RuntimeError):
    pass


class SheetsAccessError(RuntimeError):
    def __init__(self, message: str, service_account_email: str | None = None) -> None:
        super().__init__(message)
        self.service_account_email = service_account_email


def _load_credentials_dict() -> dict:
    s = get_settings()
    raw = s.google_service_account_json
    if not raw or not raw.strip():
        raise SheetsAuthError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is not set. Paste the full service-account "
            "JSON (one line) into backend/.env."
        )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SheetsAuthError(
            f"GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: {e}"
        ) from e
    if data.get("type") != "service_account":
        raise SheetsAuthError(
            "GOOGLE_SERVICE_ACCOUNT_JSON must contain a service-account key "
            '(type == "service_account").'
        )
    return data


def _extract_sheet_id(url_or_id: str) -> str:
    m = _SHEET_ID_RE.search(url_or_id)
    if m:
        return m.group(1)
    # Assume bare ID if no URL pattern found.
    return url_or_id.strip().strip("/")


def load_sheet_as_dataframe(
    url_or_id: str, worksheet: str | None = None
) -> pd.DataFrame:
    """Load a Google Sheet (by URL or bare ID) into a DataFrame.

    Raises ``SheetsAccessError`` with a friendly message if the sheet is not
    shared with the service account.
    """
    import gspread  # local import keeps optional dep out of cold path
    from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound

    creds = _load_credentials_dict()
    sa_email = creds.get("client_email")
    try:
        client = gspread.service_account_from_dict(creds)
    except Exception as e:  # noqa: BLE001
        raise SheetsAuthError(f"Failed to authorize service account: {e}") from e

    sheet_id = _extract_sheet_id(url_or_id)
    try:
        spreadsheet = client.open_by_key(sheet_id)
    except SpreadsheetNotFound as e:
        raise SheetsAccessError(
            f"Spreadsheet not found or not shared with the service account "
            f"({sa_email}). Share it as Viewer and retry.",
            service_account_email=sa_email,
        ) from e
    except APIError as e:
        msg = str(e)
        if "PERMISSION_DENIED" in msg or "403" in msg:
            raise SheetsAccessError(
                f"Permission denied. Share the sheet with {sa_email} as Viewer.",
                service_account_email=sa_email,
            ) from e
        raise SheetsAccessError(
            f"Google Sheets API error: {msg}", service_account_email=sa_email
        ) from e

    try:
        ws = (
            spreadsheet.worksheet(worksheet)
            if worksheet
            else spreadsheet.sheet1
        )
    except WorksheetNotFound as e:
        raise SheetsAccessError(
            f"Worksheet '{worksheet}' not found in spreadsheet.",
            service_account_email=sa_email,
        ) from e

    records = ws.get_all_records()
    df = pd.DataFrame(records)
    return df
