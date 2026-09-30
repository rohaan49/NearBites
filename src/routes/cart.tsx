import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { api, type Address } from "@/lib/api";
import { LocationPicker, type Coordinates } from "@/components/LocationPicker";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — NearBites" }] }),
  component: CartPage,
});

type Quote = { subtotal_pkr: number; delivery_fee_pkr: number; total_pkr: number };

function CartPage() {
  const { items, detailed, setQty, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapTarget, setMapTarget] = useState<string | null>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [addressForm, setAddressForm] = useState({ label: "Home", line1: "", area: "", city: "", latitude: null as number | null, longitude: null as number | null });
  const checkoutKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!user) return;
    api.get<{ items: Address[] }>("/users/me/addresses")
      .then((result) => {
        setAddresses(result.items);
        setAddressId(result.items.find((item) => item.is_default)?.id || result.items[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load addresses"));
  }, [user]);

  useEffect(() => {
    setQuote(null);
    const selectedAddress = addresses.find((address) => address.id === addressId);
    if (!user || !selectedAddress || selectedAddress.latitude === null || selectedAddress.longitude === null || !items.length || items.length !== detailed.length) return;
    api.post<Quote>("/orders/quote", {
      address_id: addressId,
      items: items.map((item) => ({ dish_id: item.dishId, quantity: item.qty })),
    })
      .then((result) => {
        setQuote(result);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not price this order"));
  }, [user, addressId, items, detailed.length, addresses]);

  const saveAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (addressForm.latitude === null || addressForm.longitude === null) {
      setMapTarget("new");
      setError("Choose a delivery point on the map before saving this address.");
      return;
    }
    try {
      const address = await api.post<Address>("/users/me/addresses", { ...addressForm, is_default: true });
      setAddresses((current) => [...current, address]);
      setAddressId(address.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save address");
    }
  };

  const saveMapLocation = async (coordinates: Coordinates) => {
    if (mapTarget === "new") {
      setAddressForm((current) => ({ ...current, ...coordinates }));
      setMapTarget(null);
      setError("");
      return;
    }
    const address = addresses.find((item) => item.id === mapTarget);
    if (!address) return;
    setMapSaving(true);
    setError("");
    try {
      const updated = await api.patch<Address>("/users/me/addresses/" + address.id, {
        label: address.label, line1: address.line1, area: address.area, city: address.city,
        is_default: address.is_default, ...coordinates,
      });
      setAddresses((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMapTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save map location");
    } finally {
      setMapSaving(false);
    }
  };

  const checkout = async () => {
    if (!quote || !addressId) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        "/orders",
        {
          address_id: addressId,
          items: items.map((item) => ({ dish_id: item.dishId, quantity: item.qty })),
          payment_method: "cod",
        },
        { "Idempotency-Key": checkoutKey.current },
      );
      clear();
      navigate({ to: "/orders" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <h1 className="font-display text-2xl font-bold">Your cart</h1>
        {items.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Your cart is empty. <Link to="/search" className="text-primary underline">Browse dishes</Link></p>
        ) : (
          <>
            {items.length !== detailed.length && <p className="mt-4 text-sm text-destructive">Some saved dishes are no longer available. Remove them before checkout.</p>}
            <div className="mt-4 space-y-3">
              {items.filter((item) => !detailed.some((entry) => entry.dish.id === item.dishId)).map((item) => (
                <div key={item.dishId} className="flex justify-between rounded-2xl border border-border bg-card p-3 text-sm">
                  <span>Unavailable dish #{item.dishId.slice(0, 8)}</span>
                  <button onClick={() => remove(item.dishId)} className="text-destructive">Remove</button>
                </div>
              ))}
              {detailed.map(({ dish, qty }) => (
                <div key={dish.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  {dish.image_url && <img src={dish.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                  <div className="flex-1">
                    <div className="font-display font-bold">{dish.name}</div>
                    <div className="text-sm text-primary">Rs {dish.price_pkr} each</div>
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => setQty(dish.id, qty - 1)} aria-label="Reduce quantity">−</button>
                      <span>{qty}</span>
                      <button onClick={() => setQty(dish.id, qty + 1)} aria-label="Increase quantity">+</button>
                    </div>
                  </div>
                  <button onClick={() => remove(dish.id)} className="text-xs text-destructive">Remove</button>
                </div>
              ))}
            </div>
            {!user ? (
              <Link to="/login" className="mt-5 block rounded-full bg-gradient-spice py-3 text-center font-bold text-primary-foreground">Log in to check out</Link>
            ) : (
              <>
                <section className="mt-5 rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-display font-bold">Delivery address</h2>
                  {detailed.some(({ dish }) => dish.is_demo) && <p className="mt-2 text-xs text-muted-foreground">For the local order test, choose a map point near F-6 Islamabad. No food will be prepared or delivered.</p>}
                  {addresses.length > 0 && (
                    <select value={addressId} onChange={(event) => setAddressId(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-background p-3">
                      {addresses.map((address) => (
                        <option key={address.id} value={address.id}>{address.label}: {address.line1}, {address.area}, {address.city}</option>
                      ))}
                    </select>
                  )}
                  {addressId && (
                    <>
                      <button type="button" onClick={() => setMapTarget(addressId)} className="mt-3 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
                        {addresses.find((address) => address.id === addressId)?.latitude == null ? "Choose this address on the map" : "Change map location"}
                      </button>
                      {addresses.find((address) => address.id === addressId)?.latitude == null && <p className="mt-2 text-xs text-muted-foreground">Choose a point on the map to calculate delivery and place an order.</p>}
                    </>
                  )}
                  <form onSubmit={saveAddress} className="mt-4 grid gap-2 sm:grid-cols-2">
                    {(["label", "line1", "area", "city"] as const).map((key) => (
                      <input key={key} required placeholder={key === "line1" ? "Street address" : key[0].toUpperCase() + key.slice(1)}
                        value={addressForm[key]} onChange={(event) => setAddressForm((current) => ({ ...current, [key]: event.target.value }))}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    ))}
                    <button type="button" onClick={() => setMapTarget("new")} className="rounded-xl border border-border px-4 py-2 text-sm">
                      {addressForm.latitude === null ? "Choose location on map" : "Change new address location"}
                    </button>
                    <button className="rounded-xl bg-secondary px-4 py-2 text-sm font-semibold">Save address</button>
                  </form>
                  {addressForm.latitude !== null && <p className="mt-2 text-xs text-mehndi">New address map point selected.</p>}
                  {mapTarget && <LocationPicker key={mapTarget} initial={mapTarget === "new"
                    ? addressForm.latitude !== null && addressForm.longitude !== null ? { latitude: addressForm.latitude, longitude: addressForm.longitude } : null
                    : (() => { const address = addresses.find((item) => item.id === mapTarget); return address?.latitude != null && address.longitude != null ? { latitude: address.latitude, longitude: address.longitude } : null; })()}
                    saving={mapSaving} onSave={saveMapLocation} onCancel={() => setMapTarget(null)} />}
                </section>
                <section className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm">
                  <h2 className="font-display font-bold">Cash on delivery</h2>
                  <p className="mt-1 text-muted-foreground">Pay when the order arrives. Digital payments are not enabled yet.</p>
                  {quote && (
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between"><span>Subtotal</span><span>Rs {quote.subtotal_pkr}</span></div>
                      <div className="flex justify-between"><span>Delivery</span><span>Rs {quote.delivery_fee_pkr}</span></div>
                      <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Total</span><span>Rs {quote.total_pkr}</span></div>
                    </div>
                  )}
                </section>
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                <button onClick={checkout} disabled={!quote || busy} className="mt-5 w-full rounded-full bg-gradient-spice py-3 font-bold text-primary-foreground disabled:opacity-50">
                  {busy ? "Placing order…" : "Place order"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
