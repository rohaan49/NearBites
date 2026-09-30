"""Store ChefCam detection evidence on training proofs.

Revision ID: 921d0b6f1a44
Revises: 03561850c1e4
"""

from alembic import op
import sqlalchemy as sa


revision = "921d0b6f1a44"
down_revision = "03561850c1e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("proof_submissions", sa.Column("model_result_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("proof_submissions", "model_result_json")
