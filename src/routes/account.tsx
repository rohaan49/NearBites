import { useLanguage } from "@/lib/language";
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
  const { t } = useLanguage();
  const { user, logout, refreshUser, switchWorkspace } = useAuth();
  const { role } = useCart();
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
        <h1 className="font-display text-2xl font-bold">{t("Your account")}</h1>
        {!user ? (
          <p className="mt-6 text-sm">{t("Please")} <Link to="/login" className="text-primary underline">{t("log in")}</Link> {t("to manage your account.")}</p>
        ) : (
          <>
            <div className="mt-4 rounded-3xl bg-gradient-spice p-6 text-primary-foreground">
              <div className="font-display text-xl font-bold">{user.name}</div>
              <div className="text-sm">{user.email}</div>
              <div className="mt-2 text-xs">{user.email_verified ? t("Email verified") : t("Email verification required")}</div>
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{t(error)}</p>}
            {message && <p className="mt-3 text-sm text-mehndi">{t(message)}</p>}
            <form onSubmit={saveName} className="mt-5 rounded-2xl border border-border bg-card p-4">
              <label className="text-sm font-semibold">{t("Name")}
                <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2}
                  className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2" />
              </label>
              <button className="mt-3 rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white">{t("Save profile")}</button>
            </form>
            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display font-bold">{t("Saved addresses")}</h2>
              {addresses.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("No addresses yet. Add one during checkout.")}</p>}
              {addresses.map((address) => (
                <div key={address.id} className="mt-2 border-t border-border pt-2 text-sm">{address.label}: {address.line1}, {address.area}, {address.city}</div>
              ))}
            </section>
            {user.role === "admin" ? <Link to="/admin" className="mt-5 inline-block text-sm font-semibold text-primary">{t("Open admin workspace →")}</Link> : <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display font-bold">{t("Your workspace")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("Use the same login to buy meals or manage a kitchen. Selling requires training and approval.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["student", "vendor"] as const).map((option) => (
                  <button key={option} onClick={async () => {
                    try {
                      await switchWorkspace(option === "student" ? "buyer" : "seller");
                      navigate({ to: option === "student" ? "/" : "/dashboard" });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not save preference");
                    }
                  }}
                    className={"rounded-full border px-4 py-2 text-sm " + (role === option ? "bg-gradient-spice text-white" : "bg-background")}>
                    {option === "student" ? t("Continue as buyer") : t("Continue as seller")}
                  </button>
                ))}
              </div>
              {(role === "vendor" || role === "both") && <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary">{t("Open kitchen dashboard →")}</Link>}
            </section>}
            <button onClick={async () => { await logout(); navigate({ to: "/login" }); }}
              className="mt-5 w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold text-destructive">{t("Sign out")}</button>
          </>
        )}
      </div>
    </AppShell>
  );
}
