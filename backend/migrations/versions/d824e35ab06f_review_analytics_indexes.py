"""Index common review and analytics filters.

Revision ID: d824e35ab06f
Revises: c73e619ac4a2
"""

from alembic import op


revision = "d824e35ab06f"
down_revision = "c73e619ac4a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_orders_status_placed_at", "orders", ["status", "placed_at"])
    op.create_index("ix_orders_kitchen_placed_at", "orders", ["kitchen_id", "placed_at"])
    op.create_index("ix_proofs_status_submitted_at", "proof_submissions", ["status", "submitted_at"])
    op.create_index("ix_hygiene_status_kitchen", "hygiene_reports", ["status", "kitchen_id"])


def downgrade() -> None:
    op.drop_index("ix_hygiene_status_kitchen", table_name="hygiene_reports")
    op.drop_index("ix_proofs_status_submitted_at", table_name="proof_submissions")
    op.drop_index("ix_orders_kitchen_placed_at", table_name="orders")
    op.drop_index("ix_orders_status_placed_at", table_name="orders")
