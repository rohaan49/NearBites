"""Add review ownership and successful verification date.

Revision ID: b913d708e281
Revises: a92f41b3c701
"""

from alembic import op
import sqlalchemy as sa


revision = "b913d708e281"
down_revision = "a92f41b3c701"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kitchens", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "review_assignments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("reviewer_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("target_type", "target_id", name="uq_review_assignment_target"),
    )
    op.create_index("ix_review_assignments_reviewer_id", "review_assignments", ["reviewer_id"])


def downgrade() -> None:
    op.drop_index("ix_review_assignments_reviewer_id", table_name="review_assignments")
    op.drop_table("review_assignments")
    op.drop_column("kitchens", "verified_at")
