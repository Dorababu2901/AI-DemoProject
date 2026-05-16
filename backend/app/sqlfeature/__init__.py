"""SQL Q&A feature ("Talk to Your Database") integrated into DemoApp.

Stores its own metadata in a small SQLite file alongside the app
(``sqlfeature_meta.db``) so it doesn't require an extra Alembic migration.
Reuses DemoApp's existing auth (CurrentUser) and LiteLLM configuration.
"""
