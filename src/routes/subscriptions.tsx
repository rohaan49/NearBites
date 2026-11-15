import { useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mealSecondary, type Delivery, type Subscription } from "@/lib/meal-plans";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({ meta: [{ title: "My subscriptions — NearBites" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { t, formatDate, formatTime, money } = useLanguage();
  const { user, hydrated } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancel, setCancel] = useState<string | null>(null);
  const subscriptions = useQuery({
    queryKey: ["meal-subscriptions", user?.id],
    queryFn: () => api.get<{ items: Subscription[]; today: string }>("/meal-subscriptions"),
    enabled: !!user && user.role !== "admin",
  });

  async function change(sub: Subscription, delivery?: Delivery) {
    setBusy(true);
    setError("");
    try {
      const path = "/meal-subscriptions/" + sub.id;
      if (delivery) {
        await api.patch(path + "/deliveries/" + delivery.id, {
          status: delivery.status === "skipped" ? "scheduled" : "skipped",
        });
      } else {
        await api.post(path + "/cancel", {});
        setCancel(null);
      }
      await subscriptions.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update subscription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5 px-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">{t("My subscriptions")}</h1>
          <Link to="/meal-plans" search={{ kitchen: undefined }} className={mealSecondary}>{t("Browse plans")}</Link>
        </div>
        {(!hydrated || (user && subscriptions.isLoading)) && <p>{t("Loading subscriptions…")}</p>}
        {hydrated && !user && <p><Link to="/login" className="font-semibold text-primary">{t("Log in")}</Link> {t("to see your subscriptions.")}</p>}
        {user?.role === "admin" && <p>{t("Use a buyer account to view subscriptions.")}</p>}
        {(error || subscriptions.error) && <p role="alert" className="text-sm text-destructive">{t((error || subscriptions.error?.message) ?? "")}</p>}
        {subscriptions.data?.items.length === 0 && <p className="rounded-xl border border-border p-4">{t("You haven’t booked a meal plan yet.")}</p>}
        {subscriptions.data?.items.map((sub) => (
          <article key={sub.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold">{sub.is_demo ? t(sub.plan_name) : sub.plan_name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{sub.is_demo ? t(sub.kitchen_name) : sub.kitchen_name} · {formatDate(sub.start_date)} – {formatDate(sub.end_date)}</p>
                <p className="mt-1 text-sm text-muted-foreground"><bdi>{sub.delivery_address}</bdi></p>
                {sub.is_demo && <p className="mt-1 text-sm font-semibold text-primary">{t("Fictional demo · no food or delivery")}</p>}
              </div>
              <p className="text-sm font-semibold capitalize">{t(sub.status)}</p>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("Skip or restore a meal until midnight Pakistan time before its delivery day.")}</p>
            <ul className="mt-3 divide-y divide-border">
              {sub.deliveries.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{sub.is_demo ? t(row.dish_name) : row.dish_name}</p>
                    <p className="text-muted-foreground">{formatDate(row.date)} · {formatTime(row.time)} {t("PKT ·")} {money(row.total_pkr)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="capitalize">{t(row.status)}</span>
                    {row.status === "unavailable" && <span className="text-muted-foreground">{t("Kitchen or dish on hold")}</span>}
                    {sub.status === "active" && row.date > subscriptions.data.today &&
                      ["scheduled", "skipped", "unavailable"].includes(row.status) && (
                        <button className="font-semibold text-primary disabled:opacity-50" disabled={busy}
                          onClick={() => void change(sub, row)}>{row.status === "skipped" ? t("Restore") : t("Skip")}</button>
                      )}
                  </div>
                </li>
              ))}
            </ul>
            {sub.status === "active" && (
              cancel === sub.id ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <p>{t("Cancel all meals from tomorrow onward?")}</p>
                <button disabled={busy} onClick={() => void change(sub)} className={mealSecondary + " text-destructive"}>{t("Confirm cancellation")}</button>
                <button disabled={busy} onClick={() => setCancel(null)} className="font-semibold">{t("Keep plan")}</button>
              </div> : <button className="mt-3 text-sm font-semibold text-destructive" onClick={() => setCancel(sub.id)}>{t("Cancel subscription")}</button>
            )}
          </article>
        ))}
      </div>
    </AppShell>
  );
}
