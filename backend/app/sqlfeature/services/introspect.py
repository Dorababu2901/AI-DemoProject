from __future__ import annotations

from typing import Any

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine

from ..schemas import ColumnInfo, ForeignKeyInfo, SchemaOut, TableInfo


def introspect(engine: Engine, *, sample_rows: int = 3) -> SchemaOut:
    insp = inspect(engine)
    tables: list[TableInfo] = []
    with engine.connect() as conn:
        for tname in insp.get_table_names():
            cols_raw = insp.get_columns(tname)
            pk_cols = set(insp.get_pk_constraint(tname).get("constrained_columns") or [])
            cols = [
                ColumnInfo(
                    name=c["name"],
                    type=str(c["type"]),
                    nullable=bool(c.get("nullable", True)),
                    primary_key=c["name"] in pk_cols,
                )
                for c in cols_raw
            ]
            fks = []
            for fk in insp.get_foreign_keys(tname):
                cc = fk.get("constrained_columns") or []
                rc = fk.get("referred_columns") or []
                rt = fk.get("referred_table") or ""
                for col, refc in zip(cc, rc):
                    fks.append(ForeignKeyInfo(column=col, referred_table=rt, referred_column=refc))

            try:
                row_count = conn.execute(text(f'SELECT COUNT(*) FROM "{tname}"')).scalar()
            except Exception:
                try:
                    row_count = conn.execute(text(f"SELECT COUNT(*) FROM {tname}")).scalar()
                except Exception:
                    row_count = None

            samples: list[dict[str, Any]] = []
            try:
                rs = conn.execute(text(f'SELECT * FROM "{tname}" LIMIT {sample_rows}'))
                samples = [dict(r._mapping) for r in rs]
            except Exception:
                try:
                    rs = conn.execute(text(f"SELECT * FROM {tname} LIMIT {sample_rows}"))
                    samples = [dict(r._mapping) for r in rs]
                except Exception:
                    samples = []

            tables.append(TableInfo(
                name=tname, columns=cols, foreign_keys=fks,
                row_count=row_count, sample_rows=samples,
            ))
    return SchemaOut(dialect=engine.dialect.name, tables=tables)


def schema_prompt(schema: SchemaOut, *, max_sample_chars: int = 1500) -> str:
    """Compact textual schema for an LLM prompt."""
    lines: list[str] = [f"Database dialect: {schema.dialect}", ""]
    for t in schema.tables:
        cols = ", ".join(
            f'{c.name} {c.type}{" PK" if c.primary_key else ""}{"" if c.nullable else " NOT NULL"}'
            for c in t.columns
        )
        lines.append(f"TABLE {t.name} ({cols})")
        for fk in t.foreign_keys:
            lines.append(f"  FK {fk.column} -> {fk.referred_table}.{fk.referred_column}")
        if t.sample_rows:
            sample = str(t.sample_rows[:2])
            if len(sample) > max_sample_chars:
                sample = sample[:max_sample_chars] + "..."
            lines.append(f"  sample: {sample}")
        lines.append("")
    return "\n".join(lines)
