"""Store seller supplied portion cost for estimated gross margin.

Revision ID: c73e619ac4a2
Revises: b913d708e281
"""

from alembic import op
import sqlalchemy as sa


revision = "c73e619ac4a2"
down_revision = "b913d708e281"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dishes", sa.Column("cost_per_portion_pkr", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("dishes", "cost_per_portion_pkr")
