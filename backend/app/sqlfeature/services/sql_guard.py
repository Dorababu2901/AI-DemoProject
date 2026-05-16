"""Read-only SQL guardrails.

Two-layer defense:
1. sqlparse — split on statements, ensure exactly one and it parses to a SELECT/CTE.
2. sqlglot — parse to AST, walk to ensure no DML/DDL nodes are present.
Also auto-injects ``LIMIT N`` to bare SELECTs missing one.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import sqlglot
import sqlparse
from sqlglot import exp

FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "REPLACE", "GRANT", "REVOKE", "MERGE", "CALL",
    "EXEC", "EXECUTE", "ATTACH", "DETACH", "VACUUM", "PRAGMA",
}

FORBIDDEN_AST_NAMES = {
    "Insert", "Update", "Delete", "Drop", "Create", "Command",
    "AlterTable", "Alter", "TruncateTable", "Truncate",
    "Merge", "Grant", "Revoke",
}
FORBIDDEN_AST_NODES = tuple(
    getattr(exp, n) for n in FORBIDDEN_AST_NAMES if hasattr(exp, n)
)

# Map SQLAlchemy dialect names -> sqlglot dialect names.
_DIALECT_MAP = {
    "postgresql": "postgres",
    "mssql": "tsql",
    "mariadb": "mysql",
}


def _sqlglot_dialect(d: str) -> str | None:
    if not d:
        return None
    return _DIALECT_MAP.get(d.lower(), d.lower())


class UnsafeSQLError(ValueError):
    pass


@dataclass
class GuardResult:
    sql: str
    added_limit: bool


def guard_sql(sql: str, *, dialect: str = "", default_limit: int = 100) -> GuardResult:
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise UnsafeSQLError("Empty SQL.")

    statements = [s for s in sqlparse.split(sql) if s.strip()]
    if len(statements) != 1:
        raise UnsafeSQLError("Only a single statement is allowed.")

    parsed = sqlparse.parse(statements[0])
    if not parsed:
        raise UnsafeSQLError("Could not parse SQL.")
    stmt = parsed[0]
    stmt_type = (stmt.get_type() or "").upper()
    if stmt_type not in {"SELECT", "UNKNOWN"}:
        raise UnsafeSQLError(f"Only SELECT statements are allowed (got {stmt_type}).")

    upper_sql = re.sub(r"--.*?$|/\*.*?\*/", " ", sql, flags=re.DOTALL | re.MULTILINE).upper()
    tokens = set(re.findall(r"[A-Z_]+", upper_sql))
    bad = tokens & FORBIDDEN_KEYWORDS
    if bad:
        raise UnsafeSQLError(f"Disallowed keyword(s): {', '.join(sorted(bad))}.")

    sg_dialect = _sqlglot_dialect(dialect)
    try:
        ast = sqlglot.parse_one(sql, read=sg_dialect)
    except Exception as exc:  # pragma: no cover - defensive
        raise UnsafeSQLError(f"SQL parse error: {exc}") from exc

    if not isinstance(ast, (exp.Select, exp.Subquery, exp.Union, exp.With)):
        raise UnsafeSQLError("Only SELECT/CTE statements are allowed.")

    for node in ast.walk():
        n = node[0] if isinstance(node, tuple) else node
        if isinstance(n, FORBIDDEN_AST_NODES):
            raise UnsafeSQLError(f"Disallowed node: {type(n).__name__}.")

    added_limit = False
    has_limit = ast.args.get("limit") is not None or bool(re.search(r"\bLIMIT\b", upper_sql))
    if not has_limit:
        try:
            ast = ast.limit(default_limit)
            sql = ast.sql(dialect=sg_dialect)
            added_limit = True
        except Exception:
            sql = f"{sql.rstrip(';')}\nLIMIT {default_limit}"
            added_limit = True

    return GuardResult(sql=sql, added_limit=added_limit)
