import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { api, type Address } from "@/lib/api";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — NearBites" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, logout, refreshUser } = useAuth();
  const { role, setRole } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    if (user) {
      api.get<{ items: Address[] }>("/users/me/addresses")
        .then((result) => setAddresses(result.items))
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load addresses"));
    }
  }, [user]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.patch("/users/me", { name });
      await refreshUser();
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    }
  };

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <h1 className="font-display text-2xl font-bold">Your account</h1>
        {!user ? (
          <p className="mt-6 text-sm">Please <Link to="/login" className="text-primary underline">log in</Link> to manage your account.</p>
        ) : (
          <>
            <div className="mt-4 rounded-3xl bg-gradient-spice p-6 text-primary-foreground">
              <div className="font-display text-xl font-bold">{user.name}</div>
              <div className="text-sm">{user.email}</div>
              <div className="mt-2 text-xs">{user.email_verified ? "Email verified" : "Email verification required"}</div>
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {message && <p className="mt-3 text-sm text-mehndi">{message}</p>}
            <form onSubmit={saveName} className="mt-5 rounded-2xl border border-border bg-card p-4">
              <label className="text-sm font-semibold">Name
                <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2}
                  className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2" />
              </label>
              <button className="mt-3 rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white">Save profile</button>
            </form>
            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display font-bold">Saved addresses</h2>
              {addresses.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No addresses yet. Add one during checkout.</p>}
              {addresses.map((address) => (
                <div key={address.id} className="mt-2 border-t border-border pt-2 text-sm">{address.label}: {address.line1}, {address.area}, {address.city}</div>
              ))}
            </section>
            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display font-bold">Your view</h2>
              <p className="mt-1 text-xs text-muted-foreground">This changes the navigation on this device. Seller access still requires approval.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["student", "vendor", "both"] as const).map((option) => (
                  <button key={option} onClick={async () => {
                    try {
                      await api.patch("/users/me/preferences", { view_preference: option === "student" ? "buyer" : option === "vendor" ? "seller" : "both" });
                      setRole(option);
                      await refreshUser();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not save preference");
                    }
                  }}
                    className={"rounded-full border px-4 py-2 text-sm " + (role === option ? "bg-gradient-spice text-white" : "bg-background")}>
                    {option === "student" ? "Buy" : option === "vendor" ? "Sell" : "Both"}
                  </button>
                ))}
              </div>
              {(role === "vendor" || role === "both") && <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary">Open kitchen dashboard →</Link>}
            </section>
            <button onClick={async () => { await logout(); navigate({ to: "/login" }); }}
              className="mt-5 w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold text-destructive">Sign out</button>
          </>
        )}
      </div>
    </AppShell>
  );
}
