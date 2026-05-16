from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Dialect = Literal["sqlite", "postgresql", "mysql", "mssql"]


class ConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    dialect: Dialect
    connection_string: str = Field(min_length=1)


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    dialect: str
    created_at: datetime


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    primary_key: bool


class ForeignKeyInfo(BaseModel):
    column: str
    referred_table: str
    referred_column: str


class TableInfo(BaseModel):
    name: str
    columns: list[ColumnInfo]
    foreign_keys: list[ForeignKeyInfo]
    row_count: Optional[int] = None
    sample_rows: list[dict[str, Any]] = []


class SchemaOut(BaseModel):
    dialect: str
    tables: list[TableInfo]


class QueryRequest(BaseModel):
    connection_id: int
    question: str = Field(min_length=1, max_length=2000)
    history: Optional[list[dict[str, str]]] = None


class ChartHint(BaseModel):
    type: Literal["bar", "line", "pie", "none"] = "none"
    x: Optional[str] = None
    y: Optional[str] = None


class QueryResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    explanation: str
    suggested_chart: ChartHint
    history_id: Optional[int] = None


class ExplainRequest(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    question: Optional[str] = None


class ExplainResponse(BaseModel):
    explanation: str


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    question: str
    sql: str
    explanation: str
    created_at: datetime
