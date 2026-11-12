"""Track when a listing most recently entered the review queue.

Revision ID: e516f92b77a0
Revises: d824e35ab06f
"""

from alembic import op
import sqlalchemy as sa


revision = "e516f92b77a0"
down_revision = "d824e35ab06f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dishes", sa.Column("review_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE dishes SET review_requested_at = created_at WHERE status = 'pending_review'")


def downgrade() -> None:
    op.drop_column("dishes", "review_requested_at")
