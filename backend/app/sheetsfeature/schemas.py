from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SheetSource = Literal["csv", "xlsx", "google_sheet"]


class GoogleSheetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sheet_url: str = Field(min_length=1)
    worksheet: Optional[str] = None


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    source: str
    source_ref: Optional[str] = None
    columns: list[str] = []
    row_count: int
    created_at: datetime
    updated_at: datetime


class PreviewOut(BaseModel):
    columns: list[str]
    dtypes: dict[str, str]
    rows: list[list[Any]]
    row_count: int


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: Optional[list[dict[str, str]]] = None


class AskResponse(BaseModel):
    answer: str
    code: Optional[str] = None
    columns: Optional[list[str]] = None
    rows: Optional[list[list[Any]]] = None
    history_id: Optional[int] = None


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    question: str
    answer: str
    code: Optional[str] = None
    created_at: datetime
