"""create sy_ascii_replace table

Revision ID: a1b2c3d4e5f6
Revises: eff24efb0748
Create Date: 2026-05-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "eff24efb0748"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sy_ascii_replace",
        sa.Column("ascii_symbol", sa.String(length=15), nullable=False),
        sa.Column("html_name", sa.String(length=15), nullable=True),
        sa.Column("html_number", sa.String(length=15), nullable=True),
        sa.Column("description", sa.String(length=200), nullable=True),
        sa.Column("ascii_number", sa.String(length=10), nullable=True),
        sa.PrimaryKeyConstraint("ascii_symbol", name="pk_sy_ascii_replace"),
    )


def downgrade() -> None:
    op.drop_table("sy_ascii_replace")
