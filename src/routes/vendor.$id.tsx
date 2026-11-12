import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DishCard } from "@/components/DishCard";
import { api, type Dish, type Vendor } from "@/lib/api";

export const Route = createFileRoute("/vendor/$id")({
  head: () => ({ meta: [{ title: "Home kitchen — NearBites" }] }),
  component: VendorPage,
});

function VendorPage() {
  const { id } = Route.useParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [reviews, setReviews] = useState<{ rating: number; comment: string; created_at: string }[]>([]);
  const [reliability, setReliability] = useState<{ finished_orders: number; delivered_orders: number; cancelled_or_rejected_orders: number; cancellation_rate: number | null; order_completion_rate: number | null; verified_at: string | null; training_verified: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Vendor>("/vendors/" + encodeURIComponent(id)),
      api.get<{ items: Dish[] }>("/vendors/" + encodeURIComponent(id) + "/dishes"),
      api.get<{ items: { rating: number; comment: string; created_at: string }[] }>("/vendors/" + encodeURIComponent(id) + "/reviews"),
      api.get<{ finished_orders: number; delivered_orders: number; cancelled_or_rejected_orders: number; cancellation_rate: number | null; order_completion_rate: number | null; verified_at: string | null; training_verified: boolean }>("/vendors/" + encodeURIComponent(id) + "/reliability"),
    ])
      .then(([profile, menu, feedback, trackRecord]) => {
        setVendor(profile);
        setDishes(menu.items);
        setReviews(feedback.items);
        setReliability(trackRecord);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Kitchen unavailable"));
  }, [id]);

  return (
    <AppShell>
      <div className="px-4 pt-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {vendor && (
          <>
            <div className="rounded-3xl bg-gradient-spice p-6 text-primary-foreground">
              <h1 className="font-display text-2xl font-bold">{vendor.name}</h1>
              {vendor.is_sample && <p className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">Sample kitchen · preview only</p>}
              <p className="mt-1 text-sm">{vendor.chef} · {vendor.area}</p>
              <p className="mt-3 text-sm">{vendor.bio}</p>
              <p className="mt-2 text-xs">{vendor.rating === null ? "No reviews yet" : vendor.rating + " / 5 from " + vendor.review_count + " reviews"}</p>
            </div>
            {reliability && <section className="mt-4 rounded-2xl border border-border bg-card p-4"><h2 className="font-display font-bold">Kitchen track record</h2>{vendor.is_sample && <p className="mt-1 text-xs font-semibold text-spice">Fictional demonstration figures</p>}<p className="mt-2 text-sm">{reliability.training_verified ? reliability.verified_at ? `Training verified ${new Date(reliability.verified_at).toLocaleDateString()}` : "Training verified" : "Training verification pending"}</p><p className="mt-1 text-sm">{reliability.delivered_orders} delivered orders in the last 90 days · {reliability.order_completion_rate === null ? "Completion rate available after five finished orders" : `${Math.round(reliability.order_completion_rate * 100)}% order completion out of ${reliability.finished_orders} finished orders`}</p><p className="mt-1 text-xs text-muted-foreground">This record describes past orders and training status; it does not guarantee future delivery or food safety.</p></section>}
            <h2 className="mt-6 font-display text-xl font-bold">Available menu</h2>
            {dishes.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No dishes available right now.</p>}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {dishes.map((dish) => <DishCard key={dish.id} dish={dish} />)}
            </div>
            {reviews.length > 0 && (
              <section className="mt-6">
                <h2 className="font-display text-xl font-bold">Customer reviews</h2>
                {reviews.map((review, index) => (
                  <div key={review.created_at + index} className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
                    <strong>{review.rating}/5</strong> · {review.comment || "No written comment"}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
