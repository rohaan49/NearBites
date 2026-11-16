"""Record camera capture evidence for new live dish listings."""

from alembic import op
import sqlalchemy as sa

revision = "b734ab90c221"
down_revision = "f17a02dcb485"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dishes", sa.Column("photo_captured_at", sa.DateTime(timezone=True)))
    op.add_column("dishes", sa.Column("stock_photo_used_at", sa.DateTime(timezone=True)))
    op.add_column("dishes", sa.Column("photo_challenge_code", sa.String(8)))
    op.add_column("dishes", sa.Column("photo_policy_required", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("stored_files", sa.Column("source", sa.String(20), nullable=False, server_default="upload"))
    op.add_column("stored_files", sa.Column("challenge_code", sa.String(8)))
    op.add_column("stored_files", sa.Column("sha256", sa.String(64)))
    op.create_index("ix_stored_files_sha256", "stored_files", ["sha256"])
    op.execute(sa.text("""
        UPDATE dishes SET photo_policy_required = 1
        WHERE status <> 'sample' AND kitchen_id IN (
            SELECT kitchens.id FROM kitchens JOIN users ON users.id = kitchens.owner_id
            WHERE users.email <> 'order-test-seller@demo.nearbites.invalid'
        )
    """))


def downgrade() -> None:
    op.drop_index("ix_stored_files_sha256", table_name="stored_files")
    op.drop_column("stored_files", "sha256")
    op.drop_column("stored_files", "challenge_code")
    op.drop_column("stored_files", "source")
    op.drop_column("dishes", "photo_policy_required")
    op.drop_column("dishes", "photo_challenge_code")
    op.drop_column("dishes", "photo_captured_at")
    op.drop_column("dishes", "stock_photo_used_at")
