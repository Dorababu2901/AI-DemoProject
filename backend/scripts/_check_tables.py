from sqlalchemy import create_engine, text
from app.core.config import get_settings

e = create_engine(get_settings().database_url)
with e.connect() as c:
    rows = c.execute(
        text("select tablename from pg_tables where schemaname='public' order by tablename")
    ).fetchall()
    print([r[0] for r in rows])
