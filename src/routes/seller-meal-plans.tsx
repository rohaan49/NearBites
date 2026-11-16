import { useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { ApiError, api, type Dish } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WEEKDAYS, mealButton, mealInput, mealSecondary, type Delivery, type Plan } from "@/lib/meal-plans";

export const Route = createFileRoute("/seller-meal-plans")({
  head: () => ({ meta: [{ title: "Manage meal plans — NearBites" }] }),
  component: SellerMealPlans,
});

type ScheduleRow = Delivery & { plan_name: string; buyer_name: string; delivery_address: string | null };
type Schedule = { today: string; start: string; end: string; items: ScheduleRow[] };

function SellerMealPlans() {
  const { t, formatDate, formatTime, money } = useLanguage();
  const { user, hydrated } = useAuth();
  const client = useQueryClient();
  const [editor, setEditor] = useState<Plan | "new" | null>(null);
  const [week, setWeek] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = !!user && user.role !== "admin";
  const plans = useQuery({
    queryKey: ["seller-meal-plans", user?.id],
    queryFn: () => api.get<{ items: Plan[]; kitchen_name: string; is_sample_kitchen: boolean; can_publish: boolean }>("/seller/meal-plans"),
    enabled, retry: false,
  });
  const schedule = useQuery({
    queryKey: ["seller-meal-deliveries", user?.id, week],
    queryFn: () => api.get<Schedule>("/seller/meal-deliveries" + (week ? "?start=" + week : "")),
    enabled: enabled && !!plans.data,
  });
  const listings = useQuery({
    queryKey: ["seller-meal-dishes", user?.id],
    queryFn: () => api.get<{ items: Dish[] }>("/seller/listings"),
    enabled: enabled && !!editor,
  });

  async function update(path: string, status?: string) {
    setBusy(true);
    setError("");
    try {
      if (status) await api.patch(path, { status });
      else await api.post(path, {});
      await Promise.all([plans.refetch(), schedule.refetch(), client.invalidateQueries({ queryKey: ["meal-plans"] })]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the change");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 px-4 pt-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">{t("Manage meal plans")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("Set a weekly menu and see what subscribers have booked.")}</p>
            {plans.data && <p className="mt-1 text-sm font-semibold text-primary">{plans.data.kitchen_name}</p>}
          </div>
          {plans.data && <button onClick={() => setEditor("new")} className={mealButton}>{t("New plan")}</button>}
        </header>
        {!hydrated && <p>{t("Loading your account…")}</p>}
        {hydrated && !user && <p><Link to="/login" className="font-semibold text-primary">{t("Log in")}</Link> {t("to manage your kitchen’s meal plans.")}</p>}
        {user?.role === "admin" && <p>{t("Sign in as a seller to manage meal plans.")}</p>}
        {plans.error instanceof ApiError && plans.error.status === 404 ? (
          <p>{t("Create your kitchen on the")} <Link to="/dashboard" className="font-semibold text-primary">{t("kitchen dashboard")}</Link> {t("to get started.")}</p>
        ) : plans.error && <p role="alert" className="text-destructive">{t(plans.error.message)}</p>}
        {plans.isLoading && <p>{t("Loading meal plans…")}</p>}
        {error && <p role="alert" className="text-destructive">{t(error)}</p>}
        {plans.data?.is_sample_kitchen ? <p className="rounded-xl bg-muted p-3 text-sm">{t("This sample kitchen is a preview and cannot publish meal plans. To demonstrate editable plans and orderable dishes, sign in as order-test-seller@demo.nearbites.invalid.")}</p>
          : plans.data && !plans.data.can_publish && <p className="rounded-xl bg-muted p-3 text-sm">{t("Your kitchen needs active approval, current training, and a map location to publish.")}</p>}
        {editor && plans.data && (
          listings.data ? <PlanEditor key={editor === "new" ? "new" : editor.id} plan={editor === "new" ? null : editor}
            dishes={listings.data.items.filter((dish) => dish.status === "approved")}
            canPublish={plans.data.can_publish} sampleKitchen={plans.data.is_sample_kitchen} close={() => setEditor(null)} saved={async () => {
              await Promise.all([plans.refetch(), client.invalidateQueries({ queryKey: ["meal-plans"] })]);
              setEditor(null);
            }} /> : listings.error ? <p role="alert">{t(listings.error.message)}</p> : <p>{t("Loading approved dishes…")}</p>
        )}
        {plans.data?.items.length === 0 && <p className="rounded-xl border border-border p-4 text-sm">{t("Create your first plan using dishes your kitchen already has approved.")}</p>}
        {plans.data?.items.map((plan) => (
          <article key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <h2 className="font-display text-xl font-bold">{plan.is_demo ? t(plan.name) : plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.published ? t("Published") : t("Draft")} · {Object.keys(plan.menu).length} {t("days a week ·")} {formatTime(plan.delivery_time)} {t("PKT ·")} {money(plan.price_pkr)} {t("per meal")}</p>
              {plan.is_demo && <p className="mt-1 text-sm font-semibold text-primary">{t("Fictional demo")}</p>}
            </div>
            <div className="flex gap-2">
              <button className={mealSecondary} disabled={busy} onClick={() => setEditor(plan)}>{t("Edit")}</button>
              {plan.published && <button className={mealSecondary} disabled={busy}
                onClick={() => void update(`/seller/meal-plans/${plan.id}/unpublish`)}>{t("Unpublish")}</button>}
            </div>
          </article>
        ))}
        {plans.data && <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{t("Scheduled deliveries")}</h2>
              {schedule.data && <p className="text-sm text-muted-foreground">{formatDate(schedule.data.start)} – {formatDate(schedule.data.end)}</p>}
            </div>
            <label className="text-sm">{t("Week starting")}
              <input type="date" className={mealInput} value={week || schedule.data?.start || ""} onChange={(event) => setWeek(event.target.value)} />
            </label>
          </div>
          {schedule.isPending && <p className="mt-3 text-sm">{t("Loading deliveries…")}</p>}
          {schedule.error && <p role="alert" className="mt-3 text-sm text-destructive">{t(schedule.error.message)}</p>}
          {schedule.data?.items.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("No meals are booked for this week.")}</p>}
          <ul className="mt-3 divide-y divide-border">
            {schedule.data?.items.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">{formatDate(row.date)} · {formatTime(row.time)} · {t(row.dish_name)}</p>
                  <p className="text-muted-foreground">{t(row.plan_name)} · {row.buyer_name} · {money(row.total_pkr)} {t("cash on delivery")}</p>
                  {row.delivery_address && <p>{row.delivery_address}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="capitalize">{t(row.status)}</span>
                  {row.status === "scheduled" && row.date === schedule.data.today && (
                    <button className={mealButton} disabled={busy} onClick={() => void update("/seller/meal-deliveries/" + row.id, "preparing")}>{t("Start preparing")}</button>
                  )}
                  {row.status === "preparing" && (
                    <button className={mealButton} disabled={busy} onClick={() => void update("/seller/meal-deliveries/" + row.id, "delivered")}>{t("Mark delivered")}</button>
                  )}
                  {["scheduled", "preparing", "unavailable", "missed"].includes(row.status) && (
                    <button className={mealSecondary} disabled={busy} onClick={() => {
                      if (window.confirm(t("Cancel this scheduled delivery?"))) void update("/seller/meal-deliveries/" + row.id, "cancelled");
                    }}>{t("Cancel meal")}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </AppShell>
  );
}

function PlanEditor({ plan, dishes, canPublish, sampleKitchen, close, saved }: {
  plan: Plan | null; dishes: Dish[]; canPublish: boolean; sampleKitchen: boolean; close: () => void; saved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan?.price_pkr.toString() ?? "");
  const [time, setTime] = useState(plan?.delivery_time ?? "13:00");
  const [capacity, setCapacity] = useState(plan?.capacity.toString() ?? "10");
  const [menu, setMenu] = useState<Record<string, string[]>>(
    Object.fromEntries(Object.entries(plan?.menu ?? {}).map(([day, options]) => [day, options.map((dish) => dish.id)])),
  );
  const [published, setPublished] = useState(!!plan?.published && canPublish);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const selected = Object.fromEntries(Object.entries(menu).map(([day, options]) => [day, options.filter(Boolean)])
      .filter(([, options]) => options.length));
    if (!Object.keys(selected).length) {
      setError("Choose a dish for at least one day.");
      setBusy(false);
      return;
    }
    const payload = { name, price_pkr: Number(price), capacity: Number(capacity), delivery_time: time, menu: selected, published };
    try {
      if (plan) await api.patch("/seller/meal-plans/" + plan.id, payload);
      else await api.post("/seller/meal-plans", payload);
      await saved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save meal plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">{plan ? t("Edit plan") : t("New weekly menu")}</h2>
      <fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">{t("Plan name")}<input className={mealInput} required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-sm font-semibold">{t("Price per meal (Rs)")}<input className={mealInput} required type="number" min={1} max={50000} value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label className="text-sm font-semibold">{t("Delivery time (Pakistan)")}<input className={mealInput} required type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label className="text-sm font-semibold">{t("Daily capacity for this plan")}<input className={mealInput} required type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
      </fieldset>
      <p className="mt-4 text-sm text-muted-foreground">{t("Choose up to three approved dishes per day. Changes apply to new bookings.")}</p>
      {!sampleKitchen && <p className="mt-2 text-sm">{t("Want another meal? Add any dish on your")} <Link to="/dashboard" hash="add-dish" className="font-semibold text-primary underline">{t("kitchen dashboard")}</Link>{t(". After admin approval, it will appear in these menus. Each kitchen sees only its own dishes.")}</p>}
      {!dishes.length && <p className="mt-3 text-sm">{t("Add an approved dish from your")} <Link to="/dashboard" className="font-semibold text-primary">{t("kitchen dashboard")}</Link> {t("first.")}</p>}
      <fieldset disabled={busy || !dishes.length} className="mt-3 grid gap-2">
        {WEEKDAYS.map((day, index) => (
          <fieldset key={day} className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{t(day)}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((slot) => {
                const selected = menu[index]?.[slot] ?? "";
                return <select key={slot} aria-label={t("{day} option {number}", { day: t(day), number: slot + 1 })} className={mealInput} value={selected}
                  onChange={(event) => {
                    const options = [...(menu[index] ?? ["", "", ""])];
                    options[slot] = event.target.value;
                    setMenu({ ...menu, [index]: options });
                  }}>
                  <option value="">{t("No dish")}</option>
                  {selected && !dishes.some((dish) => dish.id === selected) && <option value={selected}>{t("Unavailable dish")}</option>}
                  {dishes.map((dish) => <option key={dish.id} value={dish.id}
                    disabled={dish.id !== selected && menu[index]?.includes(dish.id)}>{dish.name}</option>)}
                </select>;
              })}
            </div>
          </fieldset>
        ))}
      </fieldset>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={published} disabled={!canPublish || busy} onChange={(event) => setPublished(event.target.checked)} /> {t("Publish for buyers")}
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{t(error)}</p>}
      <div className="mt-4 flex gap-2">
        <button className={mealButton} disabled={busy || !dishes.length}>{busy ? t("Saving…") : t("Save plan")}</button>
        <button type="button" className={mealSecondary} disabled={busy} onClick={close}>{t("Close")}</button>
      </div>
    </form>
  );
}
