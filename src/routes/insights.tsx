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
type ReviewTopics = {
  review_count: number;
  classified_count: number;
  topics: { id: string; label: string; reviews: number }[];
  recent: { review_id: string; text: string; topics: { id: string; label: string }[] }[];
  model: {
    method: string;
    training_source: string;
    training_examples: number;
    evaluation_examples: number;
    evaluation: { topic: string; label: string; precision: number; recall: number; f1: number; support: number }[];
    limit: string;
  };
};
type Opportunities = {
  retention: { eligible_first_buyers: number; second_order_within_30_days: number; third_order_within_30_days: number };
  dish_pairs: { dish_ids: string[]; names: string[]; orders_together: number }[];
  review_keywords: { keyword: string; reviews: number }[];
  review_keyword_trends: { keyword: string; recent_30_days: number; previous_30_days: number }[];
  review_count: number;
  dormant_regular_count: number;
  estimated_margins: { dish_id: string; name: string; portions: number; sales_pkr: number; estimated_gross_margin_pkr: number }[];
  dish_planning: { dish_id: string; name: string; previous_14_day_portions: number; recent_14_day_portions: number; suggested_preparation_target: number; price_note: string }[];
  forecast: { day: string; estimated_orders: number }[];
  forecast_method: string;
  margin_note: string;
};

function InsightsPage() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [reviewTopics, setReviewTopics] = useState<ReviewTopics | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunities | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Insights>("/seller/insights"),
      api.get<Reviews>("/seller/review-insights"),
      api.get<Opportunities>("/seller/analytics/opportunities"),
    ])
      .then(([data, feedback, next]) => {
        setInsights(data);
        setReviews(feedback);
        setOpportunities(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load insights"));
    api.get<ReviewTopics>("/seller/analytics/review-topics")
      .then(setReviewTopics)
      .catch(() => setReviewTopics(null));
  }, [user]);

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <Link to="/dashboard" className="text-sm text-primary">← Kitchen dashboard</Link>
        <h1 className="mt-3 font-display text-2xl font-bold">Kitchen insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email.endsWith("@demo.nearbites.invalid") ? "Fictional demo orders and reviews for presentation. These are not real sales or hygiene outcomes." : "Based on your delivered orders and submitted reviews. Planning figures are labeled as estimates."}</p>
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
              <p className="mt-1 text-xs text-muted-foreground">Delivered orders by Pakistan local day and hour during the last 30 days. Darker cells mean more orders.</p>
              {insights.heatmap.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">More order history is needed.</p> : <div className="mt-4 overflow-x-auto"><div className="min-w-[580px]"><div className="grid grid-cols-[70px_repeat(24,minmax(0,1fr))] gap-1 text-[10px] text-muted-foreground"><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-center">{hour % 3 === 0 ? hour : ""}</span>)}{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].flatMap((day, weekday) => [<span key={day} className="self-center">{day}</span>, ...Array.from({ length: 24 }, (_, hour) => { const count = insights.heatmap.find((slot) => slot.weekday === weekday && slot.hour === hour)?.orders ?? 0; const max = Math.max(...insights.heatmap.map((slot) => slot.orders)); return <span key={`${day}-${hour}`} title={`${day} ${hour}:00 — ${count} orders`} className="h-5 rounded" style={{ backgroundColor: `rgba(49, 94, 66, ${count ? 0.16 + 0.84 * count / max : 0.05})` }} />; })])}</div></div></div>}
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
        {reviewTopics && <section className="mt-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display font-bold">Review themes predicted by a text model</h2>
          <p className="mt-1 text-xs text-muted-foreground">{reviewTopics.classified_count} of {reviewTopics.review_count} reviews in the last 90 days received at least one topic. One review can have several topics. Topics include praise and complaints; a hygiene mention is not a verified safety incident. The model learned from fictional English examples.</p>
          {reviewTopics.review_count === 0 ? <p className="mt-4 text-sm text-muted-foreground">Reviews will appear here after buyers submit them.</p> : <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{reviewTopics.topics.map((topic) => <div key={topic.id} className="rounded-xl bg-secondary p-3"><p className="text-xl font-bold">{topic.reviews}</p><p className="text-xs">{topic.label}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${reviewTopics.review_count ? topic.reviews / reviewTopics.review_count * 100 : 0}%` }} /></div></div>)}</div>
            <div className="mt-5 space-y-3"><h3 className="text-sm font-semibold">Recent examples</h3>{reviewTopics.recent.map((review) => <div key={review.review_id} className="rounded-xl border border-border p-3 text-sm"><p>{review.text}</p><div className="mt-2 flex flex-wrap gap-1.5">{review.topics.length ? review.topics.map((topic) => <span key={topic.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{topic.label}</span>) : <span className="text-xs text-muted-foreground">No confident topic predicted</span>}</div></div>)}</div>
          </>}
          <details className="mt-5 rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">How this model was trained and measured</summary><p className="mt-3 text-xs text-muted-foreground">{reviewTopics.model.method}. {reviewTopics.model.training_examples} synthetic training examples and {reviewTopics.model.evaluation_examples} separate synthetic evaluation examples.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{reviewTopics.model.evaluation.map((row) => <div key={row.topic} className="rounded-lg bg-secondary p-2 text-xs"><strong>{row.label}</strong><p>Precision {Math.round(row.precision * 100)}%</p><p>Recall {Math.round(row.recall * 100)}%</p><p>F1 {Math.round(row.f1 * 100)}%</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">{reviewTopics.model.limit}</p></details>
        </section>}
        {opportunities && <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display font-bold">Buyer retention</h2><p className="mt-1 text-xs text-muted-foreground">First-time buyers from 30–120 days ago. Repeat orders counted within 30 days of their first order.</p><div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["First order", opportunities.retention.eligible_first_buyers], ["Second order", opportunities.retention.second_order_within_30_days], ["Third order", opportunities.retention.third_order_within_30_days]].map(([label, value]) => <div key={label} className="rounded-xl bg-secondary p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs">{label}</p></div>)}</div>{opportunities.retention.eligible_first_buyers === 0 && <p className="mt-3 text-sm text-muted-foreground">More mature buyer history is needed.</p>}<p className="mt-4 text-sm">{opportunities.dormant_regular_count} regular {opportunities.dormant_regular_count === 1 ? "buyer has" : "buyers have"} gone quiet relative to their usual ordering gap.</p></section>
          <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display font-bold">Dishes ordered together</h2><p className="mt-1 text-xs text-muted-foreground">Pairs found in the same delivered cart during the last 90 days.</p>{opportunities.dish_pairs.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No dish pair has appeared in at least two orders yet.</p> : opportunities.dish_pairs.map((pair) => <div key={pair.dish_ids.join("-")} className="mt-3 flex justify-between gap-3 border-b border-border pb-2 text-sm"><span>{pair.names.join(" + ")}</span><strong>{pair.orders_together} orders</strong></div>)}</section>
          <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display font-bold">Words in reviews</h2><p className="mt-1 text-xs text-muted-foreground">Simple keyword counts from {opportunities.review_count} written reviews in the last 90 days. A review can mention more than one word.</p>{opportunities.review_keywords.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No tracked keywords in recent reviews.</p> : <div className="mt-4 flex flex-wrap gap-2">{opportunities.review_keywords.map((row) => <span key={row.keyword} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{row.keyword} · {row.reviews}</span>)}</div>}{opportunities.review_keyword_trends.length > 0 && <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs">{opportunities.review_keyword_trends.map((row) => <p key={row.keyword} className="flex justify-between"><span className="capitalize">{row.keyword}</span><span>{row.previous_30_days} previous → {row.recent_30_days} recent</span></p>)}</div>}</section>
          <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display font-bold">Estimated dish margin</h2><p className="mt-1 text-xs text-muted-foreground">{opportunities.margin_note}</p>{opportunities.estimated_margins.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Add an optional portion cost to a dish on your dashboard to see an estimate.</p> : opportunities.estimated_margins.map((row) => <div key={row.dish_id} className="mt-3 flex justify-between gap-3 border-b border-border pb-2 text-sm"><span>{row.name} · {row.portions} portions</span><strong>Rs {row.estimated_gross_margin_pkr.toLocaleString()}</strong></div>)}</section>
          <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2"><h2 className="font-display font-bold">Preparation and price review tips</h2><p className="mt-1 text-xs text-muted-foreground">Compare delivered portions in two 14-day windows. Shown after ten portions; preparation changes are capped at 20%.</p>{opportunities.dish_planning.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">More dish sales are needed for a planning tip.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2">{opportunities.dish_planning.map((row) => <div key={row.dish_id} className="rounded-xl bg-secondary p-3 text-sm"><strong>{row.name}</strong><p>{row.previous_14_day_portions} → {row.recent_14_day_portions} portions; plan around {row.suggested_preparation_target} portions next time.</p><p className="mt-1 text-xs text-muted-foreground">{row.price_note}.</p></div>)}</div>}</section>
          <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2"><h2 className="font-display font-bold">Next seven days: planning estimate</h2><p className="mt-1 text-xs text-muted-foreground">{opportunities.forecast_method}. This is an estimate, not a guaranteed number of orders.</p>{opportunities.forecast.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">At least 20 delivered orders across 28 days are needed.</p> : <div className="mt-4 grid grid-cols-7 gap-2">{opportunities.forecast.map((row) => <div key={row.day} className="rounded-xl bg-secondary p-2 text-center"><p className="text-xs">{new Date(`${row.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</p><p className="mt-1 font-bold">{row.estimated_orders}</p></div>)}</div>}</section>
        </div>}
      </div>
    </AppShell>
  );
}
