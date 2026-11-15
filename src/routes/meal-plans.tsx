import { useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationPicker, type Coordinates } from "@/components/LocationPicker";
import { api, type Address } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WEEKDAYS, mealButton, mealInput, mealSecondary, type Plan } from "@/lib/meal-plans";

export const Route = createFileRoute("/meal-plans")({
  validateSearch: (search: Record<string, unknown>): { kitchen?: string } => (
    typeof search.kitchen === "string" ? { kitchen: search.kitchen } : {}
  ),
  head: () => ({ meta: [{ title: "Meal plans — NearBites" }] }),
  component: MealPlansPage,
});

type Catalog = { items: Plan[]; earliest_start: string; latest_start: string };
type Quote = {
  quote_version: string;
  end_date: string;
  delivery_time: string;
  delivery_address: string;
  total_pkr: number;
  deliveries: { date: string; dish_name: string; total_pkr: number }[];
};

function MealPlansPage() {
  const { t, formatDate, formatTime, money } = useLanguage();
  const { kitchen } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ["meal-plans", kitchen],
    queryFn: () => api.get<Catalog>("/meal-plans" + (kitchen ? "?kitchen_id=" + encodeURIComponent(kitchen) : "")),
  });

  return (
    <AppShell>
      <div className="space-y-6 px-4 pt-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><CalendarDays size={17} /> {t("Weekly menus")}</p>
            <h1 className="font-display text-3xl font-bold">{t("Meal plans")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("Choose a kitchen and book home-cooked meals on the days that suit you.")}</p>
          </div>
          <Link to="/subscriptions" className={mealSecondary}>{t("My subscriptions")}</Link>
        </header>
        {kitchen && <Link to="/meal-plans" search={{ kitchen: undefined }} className="text-sm font-semibold text-primary">{t("See all kitchens")}</Link>}
        {catalog.isPending && <p>{t("Loading meal plans…")}</p>}
        {catalog.error && <p role="alert" className="text-destructive">{t(catalog.error.message)}</p>}
        {catalog.data?.items.length === 0 && <p className="rounded-2xl border border-border bg-card p-5 text-sm">{t("No meal plans are available here yet.")}</p>}
        {catalog.data?.items.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <Link to="/vendor/$id" params={{ id: plan.kitchen_id }} className="text-sm font-semibold text-primary">{plan.is_demo ? t(plan.kitchen_name) : plan.kitchen_name}</Link>
                <h2 className="mt-1 font-display text-2xl font-bold">{plan.is_demo ? t(plan.name) : plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.area} · {formatTime(plan.delivery_time)} {t("PKT")}</p>
                {plan.is_demo && <p className="mt-1 text-sm font-semibold text-primary">{t("Fictional demo · no food or delivery")}</p>}
              </div>
              <div>
                <p className="font-semibold">{t("{price} / delivery", { price: money(plan.price_pkr + plan.delivery_fee_pkr) })}</p>
                <p className="text-xs text-muted-foreground">{t("Includes {fee} delivery fee", { fee: money(plan.delivery_fee_pkr) })}</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(plan.menu).filter(([, options]) => options.length).map(([day, options]) => (
                <div key={day} className="rounded-xl bg-muted/60 p-3">
                  <dt className="text-sm font-semibold">{t(WEEKDAYS[Number(day)])}</dt>
                  <dd className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {options.map((dish) => <div key={dish.id}>{plan.is_demo ? t(dish.name) : dish.name}</div>)}
                  </dd>
                </div>
              ))}
            </dl>
            <button className={mealSecondary + " mt-4"} onClick={() => setSelected(selected === plan.id ? null : plan.id)}>
              {selected === plan.id ? t("Close booking") : t("Choose days and meals")}
            </button>
            {selected === plan.id && catalog.data && (
              <BookPlan plan={plan} earliest={catalog.data.earliest_start} latest={catalog.data.latest_start} />
            )}
          </article>
        ))}
      </div>
    </AppShell>
  );
}

function BookPlan({ plan, earliest, latest }: { plan: Plan; earliest: string; latest: string }) {
  const { t, formatDate, formatTime, money } = useLanguage();
  const { user, hydrated } = useAuth();
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const bookingKey = useRef("");
  const [address, setAddress] = useState("");
  const [start, setStart] = useState(earliest);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const addresses = useQuery({
    queryKey: ["meal-addresses", user?.id],
    queryFn: () => api.get<{ items: Address[] }>("/users/me/addresses"),
    enabled: !!user?.email_verified && user.role !== "admin",
  });
  const pinned = (addresses.data?.items ?? []).filter((item) => item.latitude !== null && item.longitude !== null);
  const demoAddress = plan.is_demo && pinned.find((item) => item.label === "Meal Plan Demo Address");
  const addressId = pinned.find((item) => item.id === address)?.id ||
    (demoAddress ? demoAddress.id : undefined) || pinned.find((item) => item.is_default)?.id || pinned[0]?.id || "";

  if (!hydrated) return <p className="mt-4 text-sm">{t("Loading your account…")}</p>;
  if (!user) return <p className="mt-4 text-sm"><Link to="/login" className="font-semibold text-primary">{t("Log in")}</Link> {t("to subscribe.")}</p>;
  if (user.role === "admin") return <p className="mt-4 text-sm">{t("Use a buyer account to subscribe.")}</p>;
  if (!user.email_verified) return <Link to="/verify-email" className="mt-4 inline-block font-semibold text-primary">{t("Verify your email to subscribe")}</Link>;
  if (addresses.isPending) return <p className="mt-4 text-sm">{t("Loading delivery addresses…")}</p>;
  if (addresses.error) return <p role="alert" className="mt-4 text-sm text-destructive">{t(addresses.error.message)}</p>;
  if (!pinned.length || addingAddress) return <PlanAddressForm
    cancel={pinned.length ? () => setAddingAddress(false) : undefined}
    saved={async (newAddress) => {
      await addresses.refetch();
      setAddress(newAddress.id);
      setQuote(null);
      setAddingAddress(false);
    }}
  />;

  function choose(day: string, dish: string) {
    const next = { ...choices };
    if (dish) next[day] = dish;
    else delete next[day];
    setChoices(next);
    setQuote(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const selection = { address_id: addressId, start_date: start, choices };
    try {
      if (quote) {
        await api.post(`/meal-plans/${plan.id}/subscribe`, {
          ...selection,
          quote_version: quote.quote_version,
        }, { "Idempotency-Key": bookingKey.current });
        await client.invalidateQueries({ queryKey: ["meal-subscriptions", user?.id] });
        await navigate({ to: "/subscriptions" });
      } else {
        const reviewed = await api.post<Quote>(`/meal-plans/${plan.id}/quote`, selection);
        bookingKey.current = crypto.randomUUID();
        setQuote(reviewed);
      }
    } catch (err) {
      if (!(err instanceof TypeError)) setQuote(null);
      setError(err instanceof Error ? err.message : "Could not book this plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4 border-t border-border pt-5">
      <p className="text-sm text-muted-foreground">{t("Your selections repeat each week for one month. Pay cash at each delivery. Renew when you’re ready.")}</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">{t("Delivery address")}
            <select className={mealInput} value={addressId} onChange={(event) => { setAddress(event.target.value); setQuote(null); }}>
              {pinned.map((item) => <option key={item.id} value={item.id}>{t(item.label)} · {item.area}</option>)}
            </select>
          </label>
          <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => setAddingAddress(true)}>{t("Add delivery address")}</button>
        </div>
        <label className="text-sm font-semibold">{t("Start date")}
          <input className={mealInput} type="date" required min={earliest} max={latest} value={start}
            onChange={(event) => { setStart(event.target.value); setQuote(null); }} />
        </label>
        {Object.entries(plan.menu).filter(([, options]) => options.length).map(([day, options]) => (
          <label key={day} className="text-sm font-semibold">{t(WEEKDAYS[Number(day)])}
            <select className={mealInput} value={choices[day] ?? ""} onChange={(event) => choose(day, event.target.value)}>
              <option value="">{t("No meal")}</option>
              {options.map((dish) => <option key={dish.id} value={dish.id}>{plan.is_demo ? t(dish.name) : dish.name}</option>)}
            </select>
            {options.filter((dish) => dish.id === choices[day] && dish.description).map((dish) => (
              <span key={dish.id} dir="auto" className="mt-1 block text-xs font-normal text-muted-foreground">
                {plan.is_demo ? t(dish.description) : dish.description}
              </span>
            ))}
          </label>
        ))}
      </fieldset>
      {quote && <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <p className="font-semibold">{t("{count} meals through {date} · {total} total", { count: quote.deliveries.length, date: formatDate(quote.end_date), total: money(quote.total_pkr) })}</p>
        <p className="mt-1">{t("Cash due at each delivery ·")} {formatTime(quote.delivery_time)} {t("PKT")}</p>
        <p className="mt-1"><bdi>{quote.delivery_address}</bdi></p>
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold">{t("View delivery dates")}</summary>
          <ul className="mt-2 space-y-1">{quote.deliveries.map((row) => <li key={row.date}>{formatDate(row.date)} · {plan.is_demo ? t(row.dish_name) : row.dish_name} · {money(row.total_pkr)}</li>)}</ul>
        </details>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <button className={mealButton} disabled={busy || !Object.keys(choices).length}>{busy ? t("Please wait…") : quote ? t("Confirm subscription") : t("Review schedule and price")}</button>
    </form>
  );
}

function PlanAddressForm({ saved, cancel }: { saved: (address: Address) => Promise<void>; cancel?: () => void }) {
  const { t } = useLanguage();
  const [fields, setFields] = useState({ label: "Home", line1: "", area: "", city: "" });
  const [point, setPoint] = useState<Coordinates | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!point) {
      setShowMap(true);
      setError("Choose a delivery point on the map.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saved(await api.post<Address>("/users/me/addresses", { ...fields, ...point, is_default: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the delivery address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-5">
      <h3 className="font-semibold">{t("Add a delivery address")}</h3>
      <form onSubmit={submit}>
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
          {([["label", "Address label", 80], ["line1", "Street address", 255], ["area", "Area", 160], ["city", "City", 100]] as const)
            .map(([key, label, max]) => (
              <label key={key} className="text-sm font-semibold">{t(label)}
                <input required maxLength={max} className={mealInput} value={fields[key]}
                  onChange={(event) => setFields({ ...fields, [key]: event.target.value })} />
              </label>
            ))}
        </fieldset>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={mealSecondary} onClick={() => setShowMap(true)} disabled={busy}>{point ? t("Change map pin") : t("Choose location on map")}</button>
          <button className={mealButton} disabled={busy}>{busy ? t("Saving…") : t("Save address")}</button>
          {cancel && <button type="button" className={mealSecondary} onClick={cancel} disabled={busy}>{t("Cancel")}</button>}
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      {showMap && <LocationPicker initial={point} onCancel={() => setShowMap(false)} onSave={(coordinates) => {
        setPoint(coordinates);
        setShowMap(false);
        setError("");
      }} />}
    </div>
  );
}
