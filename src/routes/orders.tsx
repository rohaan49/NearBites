import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { api, type Order } from "@/lib/api";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — NearBites" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reporting, setReporting] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get<{ items: Order[] }>("/orders")
      .then((result) => setOrders(result.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load orders"));
  }, [user]);

  const submitReview = async (orderId: string) => {
    try {
      await api.post("/orders/" + orderId + "/review", { rating, comment });
      setReviewing("");
      setMessage("Review submitted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit review");
    }
  };

  const submitReport = async (orderId: string) => {
    try {
      await api.post("/orders/" + orderId + "/hygiene-reports", { description });
      setReporting("");
      setMessage("Hygiene report submitted for admin review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    }
  };

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <h1 className="font-display text-2xl font-bold">Orders</h1>
        {!user && <p className="mt-6 text-sm">Please <Link to="/login" className="text-primary underline">log in</Link> to see your orders.</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {message && <p className="mt-3 text-sm text-mehndi">{message}</p>}
        {user && orders.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">No orders yet.</p>}
        <div className="mt-4 space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between gap-3">
                <div className="font-display font-bold capitalize">{order.status.replaceAll("_", " ")}</div>
                <div className="text-xs text-muted-foreground">{new Date(order.placed_at).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Order #{order.id.slice(0, 8)}</div>
              <div className="mt-3 text-sm">{order.items.map((item) => item.quantity + "× " + item.name).join(", ")}</div>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Cash on delivery</span><span>Rs {order.total_pkr}</span></div>
              {order.status === "delivered" && (
                <button onClick={() => setReviewing(order.id)} className="mt-3 text-sm font-semibold text-primary">Write a review</button>
              )}
              {!["placed", "rejected", "cancelled"].includes(order.status) && (
                <button onClick={() => setReporting(order.id)} className="ml-4 mt-3 text-sm text-destructive">Report a hygiene concern</button>
              )}
              {reviewing === order.id && (
                <div className="mt-3 space-y-2">
                  <select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="rounded-xl border border-border p-2">
                    {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
                  </select>
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell others about your order" className="w-full rounded-xl border border-border p-2 text-sm" />
                  <button onClick={() => submitReview(order.id)} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm text-white">Submit review</button>
                </div>
              )}
              {reporting === order.id && (
                <div className="mt-3 space-y-2">
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the concern" className="w-full rounded-xl border border-border p-2 text-sm" />
                  <button onClick={() => submitReport(order.id)} className="rounded-xl bg-spice px-4 py-2 text-sm text-white">Send report</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
