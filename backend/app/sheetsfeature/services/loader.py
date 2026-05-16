"""Load CSV / XLSX uploads into a Pandas DataFrame."""
from __future__ import annotations

import csv
from io import BytesIO

import pandas as pd


def _sniff_delimiter(sample: bytes) -> str:
    text = sample.decode("utf-8", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def load_csv(data: bytes) -> pd.DataFrame:
    delim = _sniff_delimiter(data[:4096])
    return pd.read_csv(BytesIO(data), low_memory=False, sep=delim)


def load_xlsx(data: bytes, worksheet: str | None = None) -> pd.DataFrame:
    return pd.read_excel(
        BytesIO(data),
        engine="openpyxl",
        sheet_name=worksheet if worksheet else 0,
    )
