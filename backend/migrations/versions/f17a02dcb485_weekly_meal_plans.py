"""Add weekly meal plans, monthly subscriptions, and scheduled deliveries."""

from alembic import op
import sqlalchemy as sa

revision = "f17a02dcb485"
down_revision = "e516f92b77a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kitchen_id", sa.String(36), sa.ForeignKey("kitchens.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price_pkr", sa.Integer(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("delivery_time", sa.String(5), nullable=False),
        sa.Column("menu", sa.JSON(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "meal_subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("meal_plans.id"), nullable=False),
        sa.Column("buyer_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_name", sa.String(120), nullable=False),
        sa.Column("delivery_address", sa.Text(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
    )
    op.create_table(
        "meal_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("subscription_id", sa.String(36), sa.ForeignKey("meal_subscriptions.id"), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("delivery_time", sa.String(5), nullable=False),
        sa.Column("dish_id", sa.String(36), sa.ForeignKey("dishes.id"), nullable=False),
        sa.Column("dish_name", sa.String(140), nullable=False),
        sa.Column("total_pkr", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.UniqueConstraint("subscription_id", "delivery_date"),
    )
    op.create_index("ix_meal_plans_kitchen_id", "meal_plans", ["kitchen_id"])
    op.create_index("ix_meal_subscriptions_plan_id", "meal_subscriptions", ["plan_id"])
    op.create_index("ix_meal_subscriptions_buyer_id", "meal_subscriptions", ["buyer_id"])
    op.create_index("ix_meal_deliveries_subscription_id", "meal_deliveries", ["subscription_id"])
    op.create_index("ix_meal_deliveries_delivery_date", "meal_deliveries", ["delivery_date"])


def downgrade() -> None:
    op.drop_table("meal_deliveries")
    op.drop_table("meal_subscriptions")
    op.drop_table("meal_plans")
