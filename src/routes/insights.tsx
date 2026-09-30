import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Kitchen insights — NearBites" }] }),
  component: InsightsPage,
});

type Insights = {
  orders: number;
  repeat_buyers: number;
  average_rating: number | null;
  daily: { day: string; orders: number; revenue_pkr: number }[];
  heatmap: { weekday: number; hour: number; orders: number }[];
};
type Reviews = {
  total_reviews: number;
  recent: { id: string; rating: number; comment: string; created_at: string }[];
};

function InsightsPage() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Insights>("/seller/insights"),
      api.get<Reviews>("/seller/review-insights"),
    ])
      .then(([data, feedback]) => {
        setInsights(data);
        setReviews(feedback);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load insights"));
  }, [user]);

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <Link to="/dashboard" className="text-sm text-primary">← Kitchen dashboard</Link>
        <h1 className="mt-3 font-display text-2xl font-bold">Kitchen insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">Based on delivered orders and submitted reviews. Nothing here is estimated from sample data.</p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {insights && (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Delivered orders", insights.orders],
                ["Repeat buyers", insights.repeat_buyers],
                ["Rating", insights.average_rating ?? "No reviews"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
                  <div className="font-display text-xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <section className="mt-5 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display font-bold">Orders by day</h2>
              {insights.daily.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No delivered orders in this period.</p> : (
                <div className="mt-3 space-y-2">
                  {insights.daily.map((day) => (
                    <div key={day.day} className="flex justify-between border-b border-border pb-2 text-sm">
                      <span>{day.day}</span><span>{day.orders} orders · Rs {day.revenue_pkr}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="mt-5 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display font-bold">Busy times</h2>
              {insights.heatmap.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">More order history is needed.</p> : (
                <div className="mt-3 space-y-1 text-sm">
                  {insights.heatmap.map((slot) => (
                    <div key={slot.weekday + "-" + slot.hour}>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][slot.weekday]} {slot.hour}:00 — {slot.orders} orders
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {reviews && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display font-bold">Customer reviews ({reviews.total_reviews})</h2>
            {reviews.recent.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>}
            {reviews.recent.map((review) => (
              <div key={review.id} className="mt-3 border-t border-border pt-3 text-sm">
                <span className="font-semibold">{review.rating}/5</span> · {review.comment || "No written comment"}
              </div>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
