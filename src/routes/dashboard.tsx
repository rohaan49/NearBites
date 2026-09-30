import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DishPhotoPicker } from "@/components/DishPhotoPicker";
import { useAuth } from "@/lib/auth";
import { api, type Dish, type Order, type Vendor } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Kitchen dashboard — NearBites" }] }),
  component: Dashboard,
});

type Summary = {
  orders: number;
  delivered_orders: number;
  revenue_pkr: number;
  rating: number | null;
  top_dishes: { dish_id: string; name: string; quantity: number }[];
};

function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [kitchen, setKitchen] = useState<Vendor | null>(null);
  const [listings, setListings] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [kitchenForm, setKitchenForm] = useState({ name: "", chef: "", area: "", bio: "", latitude: null as number | null, longitude: null as number | null });
  const [listingForm, setListingForm] = useState({
    name: "", description: "", price_pkr: "", portion_size: "regular", portions_available: "", tag: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const profile = await api.get<Vendor>("/seller/kitchen");
      setKitchen(profile);
      const [menu, incoming, stats] = await Promise.all([
        api.get<{ items: Dish[] }>("/seller/listings"),
        api.get<{ items: Order[] }>("/seller/orders"),
        api.get<Summary>("/seller/dashboard"),
      ]);
      setListings(menu.items);
      setOrders(incoming.items);
      setSummary(stats);
      setError("");
    } catch (err) {
      if (!(err instanceof Error && "status" in err && err.status === 404)) {
        setError(err instanceof Error ? err.message : "Could not load dashboard");
      }
    }
  };

  useEffect(() => { if (user) void load(); }, [user]);

  const createKitchen = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/seller/kitchen", kitchenForm);
      await refreshUser();
      await load();
      setMessage("Kitchen created. Complete training and wait for admin approval.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create kitchen");
    } finally {
      setBusy(false);
    }
  };

  const createListing = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!photo) throw new Error("Add a real photo of the dish.");
      const form = new FormData();
      form.append("file", photo);
      const uploaded = await api.post<{ url: string }>("/uploads/images", form);
      const created = await api.post<Dish>("/seller/listings", {
        name: listingForm.name,
        description: listingForm.description,
        price_pkr: Number(listingForm.price_pkr),
        portion_size: listingForm.portion_size,
        portions_available: Number(listingForm.portions_available),
        image_url: uploaded.url,
        tag: listingForm.tag || null,
      });
      setListings((current) => [...current, created]);
      setListingForm({ name: "", description: "", price_pkr: "", portion_size: "regular", portions_available: "", tag: "" });
      setPhoto(null);
      setMessage("Listing sent for admin review.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish listing");
    } finally {
      setBusy(false);
    }
  };

  const advance = async (order: Order, status: string) => {
    try {
      await api.patch("/seller/orders/" + order.id + "/status", { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order");
    }
  };

  const saveAvailability = async (dish: Dish, paused: boolean) => {
    try {
      await api.patch("/seller/listings/" + dish.id + "/availability", {
        portions_available: Number(stockDraft[dish.id] ?? dish.portions_available),
        paused,
      });
      await load();
      setMessage("Availability updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update listing");
    }
  };

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <h1 className="font-display text-2xl font-bold">Kitchen dashboard</h1>
        {!user && <p className="mt-5 text-sm">Please <Link to="/login" className="text-primary underline">log in</Link> first.</p>}
        {user && !user.email_verified && <p className="mt-4 text-sm">Please <Link to="/verify-email" className="text-primary underline">verify your email</Link> before selling.</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {message && <p className="mt-3 text-sm text-mehndi">{message}</p>}
        {user && user.email_verified && !kitchen && (
          <form onSubmit={createKitchen} className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display font-bold">Create your kitchen</h2>
            {(["name", "chef", "area", "bio"] as const).map((key) => (
              <input key={key} required={key !== "bio"} placeholder={key === "name" ? "Kitchen name" : key === "chef" ? "Chef name" : key === "area" ? "Area" : "About your kitchen"}
                value={kitchenForm[key]} onChange={(event) => setKitchenForm((current) => ({ ...current, [key]: event.target.value }))}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            ))}
            <button type="button" onClick={() => navigator.geolocation.getCurrentPosition(
              (position) => setKitchenForm((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude })),
              () => setError("Location access was denied. Add the area now and set coordinates later."),
            )} className="rounded-xl border border-border px-4 py-2 text-sm">
              {kitchenForm.latitude === null ? "Add kitchen location" : "Kitchen location added"}
            </button>
            <button disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create kitchen</button>
          </form>
        )}
        {kitchen && (
          <>
            <div className="mt-4 rounded-3xl bg-gradient-spice p-5 text-primary-foreground">
              <div className="font-display text-xl font-bold">{kitchen.name}</div>
              <div className="text-sm">{kitchen.area} · {kitchen.status.replaceAll("_", " ")}</div>
              <div className="mt-2 text-xs">{kitchen.training_verified ? "Training verified" : "Training or proof review pending"}</div>
              {!kitchen.location_set && (
                <button onClick={() => navigator.geolocation.getCurrentPosition(
                  async (position) => {
                    try {
                      await api.patch("/seller/kitchen", { latitude: position.coords.latitude, longitude: position.coords.longitude });
                      await load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not save location");
                    }
                  },
                  () => setError("Location access is required for delivery. Enable it and try again."),
                )} className="mt-3 rounded-xl bg-white/20 px-3 py-2 text-xs font-semibold">Add map location for delivery</button>
              )}
            </div>
            {!kitchen.training_verified && <Link to="/seller-training" className="mt-4 inline-block rounded-xl bg-secondary px-4 py-2 text-sm font-semibold">Open seller training →</Link>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ["Orders this week", summary?.orders ?? 0],
                ["Delivered", summary?.delivered_orders ?? 0],
                ["Earnings", "Rs " + (summary?.revenue_pkr ?? 0)],
                ["Rating", summary?.rating ?? "No reviews"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
                  <div className="font-display text-xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <Link to="/insights" className="mt-4 inline-block text-sm font-semibold text-primary">View real order insights →</Link>
            <section className="mt-6">
              <h2 className="font-display text-lg font-bold">Incoming orders</h2>
              {orders.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No orders yet.</p>}
              <div className="mt-3 space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex justify-between text-sm font-bold"><span>#{order.id.slice(0, 8)}</span><span className="capitalize">{order.status.replaceAll("_", " ")}</span></div>
                    <p className="mt-2 text-sm">{order.items.map((item) => item.quantity + "× " + item.name).join(", ")}</p>
                    <p className="mt-1 text-sm">Rs {order.total_pkr} · Cash on delivery</p>
                    <div className="mt-3 flex gap-2">
                      {order.status === "placed" && (
                        <>
                          <button onClick={() => advance(order, "accepted")} className="rounded-xl bg-mehndi px-3 py-2 text-xs font-semibold text-white">Accept</button>
                          <button onClick={() => advance(order, "rejected")} className="rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-white">Reject</button>
                        </>
                      )}
                      {order.status === "accepted" && <button onClick={() => advance(order, "cooking")} className="rounded-xl bg-gradient-spice px-3 py-2 text-xs font-semibold text-white">Start cooking</button>}
                      {order.status === "cooking" && <button onClick={() => advance(order, "ready")} className="rounded-xl bg-gradient-spice px-3 py-2 text-xs font-semibold text-white">Mark ready</button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="mt-6">
              <h2 className="font-display text-lg font-bold">Your listings</h2>
              {listings.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No listings yet.</p>}
              <div className="mt-3 space-y-2">
                {listings.map((dish) => (
                  <div key={dish.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{dish.name} · Rs {dish.price_pkr}</span>
                      <span className="capitalize text-muted-foreground">{dish.status.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs">Portions
                        <input type="number" min="0" value={stockDraft[dish.id] ?? dish.portions_available}
                          onChange={(event) => setStockDraft((current) => ({ ...current, [dish.id]: event.target.value }))}
                          className="ml-2 w-20 rounded-lg border border-border bg-background px-2 py-1" />
                      </label>
                      <button onClick={() => saveAvailability(dish, dish.status === "paused")} className="rounded-lg bg-secondary px-2 py-1 text-xs">Save stock</button>
                      {["approved", "paused"].includes(dish.status) && (
                        <button onClick={() => saveAvailability(dish, dish.status === "approved")} className="rounded-lg bg-secondary px-2 py-1 text-xs">
                          {dish.status === "approved" ? "Pause" : "Resume"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {!kitchen.training_verified || kitchen.status !== "active" ? (
              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display font-bold">Add a dish</h2>
                <p className="mt-2 text-sm text-muted-foreground">Finish seller training and get your kitchen approved to submit a listing for review.</p>
                <Link to="/seller-training" className="mt-3 inline-block text-sm font-semibold text-primary underline">View training progress</Link>
              </div>
            ) : (
              <form onSubmit={createListing} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display font-bold">Add a dish</h2>
                <input required placeholder="Dish name" value={listingForm.name} onChange={(event) => setListingForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                <textarea placeholder="Ingredients, allergens, and description" value={listingForm.description} onChange={(event) => setListingForm((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input required type="number" min="1" placeholder="Price in PKR" value={listingForm.price_pkr} onChange={(event) => setListingForm((current) => ({ ...current, price_pkr: event.target.value }))} className="rounded-xl border border-border bg-background p-3 text-sm" />
                  <input required type="number" min="0" placeholder="Portions" value={listingForm.portions_available} onChange={(event) => setListingForm((current) => ({ ...current, portions_available: event.target.value }))} className="rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <select value={listingForm.portion_size} onChange={(event) => setListingForm((current) => ({ ...current, portion_size: event.target.value }))} className="w-full rounded-xl border border-border bg-background p-3 text-sm">
                  <option value="small">Small</option><option value="regular">Regular</option><option value="large">Large</option>
                </select>
                <DishPhotoPicker photo={photo} onChange={setPhoto} />
                <button disabled={busy} className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Submit for review</button>
              </form>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
