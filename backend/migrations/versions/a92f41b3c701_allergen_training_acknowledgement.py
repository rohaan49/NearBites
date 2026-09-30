"""Store seller acknowledgements for lessons that do not need media proof.

Revision ID: a92f41b3c701
Revises: 921d0b6f1a44
"""

from alembic import op
import sqlalchemy as sa


revision = "a92f41b3c701"
down_revision = "921d0b6f1a44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_acknowledgements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("module_id", sa.String(length=40), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["module_id"], ["training_modules.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_training_acknowledgements_user_id", "training_acknowledgements", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_training_acknowledgements_user_id", table_name="training_acknowledgements")
    op.drop_table("training_acknowledgements")
