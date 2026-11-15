import { useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DishCard } from "@/components/DishCard";
import { api, type Dish, type Vendor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import hero from "@/assets/hero-biryani.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "NearBites — home-cooked food" }] }),
  component: Home,
});

function Home() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [recommendations, setRecommendations] = useState<Dish[]>([]);
  const [recommendationReasons, setRecommendationReasons] = useState<Record<string, { match_score: number; reason: string }>>({});
  const [reorders, setReorders] = useState<{ dish_id: string; name: string; vendor_id: string; vendor_name: string; matching_days: number }[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [discovery, setDiscovery] = useState<{
    trending: (Dish & { portions_sold_30d: number; dinner_portions_30d: number })[];
    popular_kitchens: { id: string; name: string; chef: string; area: string; orders_90d: number; rating: number | null; review_count: number; is_demo: boolean }[];
    popular_by_day: { weekday: number; dish: string; orders_90d: number }[];
    definition: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api.get<{ items: Dish[] }>("/dishes?limit=12"),
      api.get<{ items: Vendor[] }>("/vendors?limit=10"),
      api.get<typeof discovery extends null ? never : NonNullable<typeof discovery>>("/marketplace/discovery"),
    ])
      .then(([dishList, vendorList, discoveryData]) => {
        setDishes(dishList.items);
        setVendors(vendorList.items);
        setDiscovery(discoveryData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load kitchens"));
  }, []);
  useEffect(() => {
    if (!user) return;
    api.get<{ items: (Dish & { match_score: number; reason: string })[] }>("/users/me/recommendations?limit=4")
      .then((result) => {
        setRecommendations(result.items);
        setRecommendationReasons(Object.fromEntries(result.items.map((item) => [item.id, { match_score: item.match_score, reason: item.reason }])));
      })
      .catch(() => { setRecommendations([]); setRecommendationReasons({}); });
    api.get<{ items: typeof reorders }>("/users/me/reorder-prompts")
      .then((result) => setReorders(result.items))
      .catch(() => setReorders([]));
  }, [user]);

  return (
    <AppShell>
      <section className="relative mx-4 mt-4 overflow-hidden rounded-3xl bg-gradient-spice text-primary-foreground">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative p-7">
          <h1 className="font-display text-3xl font-bold">{t("Ghar ka khana, delivered warm.")}</h1>
          <p className="mt-2 max-w-md text-sm">{t("Explore Islamabad-inspired home menus. Sample kitchens are labeled and cannot take orders.")}</p>
          <Link to="/search" className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary">{t("Explore dishes")}</Link>
        </div>
      </section>
      {error && <p className="mx-4 mt-5 text-sm text-destructive">{t(error)}</p>}
      {reorders.length > 0 && <section className="px-4 pt-6"><h2 className="font-display text-xl font-bold">{t("Your usual order today")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Based on dishes you ordered on this weekday during the last 12 weeks.")}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{reorders.map((item) => <Link key={item.dish_id} to="/vendor/$id" params={{ id: item.vendor_id }} className="rounded-2xl border border-border bg-card p-4"><strong>{item.name}</strong><p className="mt-1 text-sm text-muted-foreground">{t("From")} {item.vendor_name} {t("· ordered on")} {item.matching_days} {t("matching days")}</p><span className="mt-2 inline-block text-sm font-semibold text-primary">{t("View dish →")}</span></Link>)}</div></section>}
      {recommendations.length > 0 && (
        <section className="px-4 pt-6">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("Personalised picks")}</p>
          <h2 className="font-display text-xl font-bold">{t("Recommended for you")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Picks use your orders, similar buyers' dishes, recent demand, live portions, and your delivery area.")}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((dish) => <div key={dish.id} className="min-w-0"><DishCard dish={dish} /><div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-xs"><span className="text-muted-foreground">{t(recommendationReasons[dish.id]?.reason ?? "")}</span><strong className="shrink-0 text-mehndi">{dish.portions_available} {t("left")}</strong></div></div>)}
          </div>
        </section>
      )}
      {discovery && <>
        <section className="px-4 pt-7">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("Trending tonight")}</p>
          <h2 className="font-display text-xl font-bold">{t("Popular dishes, still available")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Ranked by delivered portions in the last 30 days. Stock is live.")}</p>
          {discovery.trending.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("No currently orderable dishes have recent order history.")}</p> : <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{discovery.trending.map((dish) => <div key={dish.id}><DishCard dish={dish} /><div className="mt-2 flex justify-between rounded-xl bg-secondary px-3 py-2 text-xs"><span>{dish.portions_sold_30d} {t("portions sold this month")}</span><strong>{dish.portions_available} {t("left")}</strong></div></div>)}</div>}
        </section>
        <section className="px-4 pt-7">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("Popular kitchens")}</p>
          <h2 className="font-display text-xl font-bold">{t("Loved by buyers")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Ranked by adjusted buyer rating. A few reviews carry less weight than a consistent review history. Sample kitchens are preview only.")}</p>
          {discovery.popular_kitchens.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("Kitchen popularity will appear after buyers receive orders.")}</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{discovery.popular_kitchens.map((kitchen) => <Link key={kitchen.id} to="/vendor/$id" params={{ id: kitchen.id }} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-bold">{kitchen.name}</h3><p className="text-sm text-muted-foreground">{t("by")} {kitchen.chef} · {kitchen.area}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-mehndi">{kitchen.rating === null ? t("New") : `★ ${kitchen.rating}`}</span></div><p className="mt-2 text-xs text-muted-foreground">{kitchen.review_count > 0 ? `${t("Adjusted from")} ${kitchen.review_count} ${t("reviews")}` : t("No reviews yet")}</p><p className="mt-3 text-sm">{kitchen.orders_90d} {t("delivered orders in the last 90 days")}</p>{kitchen.is_demo && <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("Demo activity")}</span>}</Link>)}</div>}
        </section>
        <section className="px-4 pt-7">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("Popular by day")}</p>
          <h2 className="font-display text-xl font-bold">{t("What buyers order each day")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Top dish per weekday, based on delivered portions over 90 days.")}</p>
          {discovery.popular_by_day.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("Weekday trends will appear when there is enough order history.")}</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{discovery.popular_by_day.map((row) => { const top = Math.max(...discovery.popular_by_day.map((item) => item.orders_90d)); return <div key={row.weekday} className="rounded-xl border border-border bg-card p-3"><div className="flex justify-between text-sm"><strong>{t(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][row.weekday])}</strong><span className="text-muted-foreground">{row.orders_90d} {t("portions")}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, row.orders_90d / top * 100)}%` }} /></div><p className="mt-2 text-sm">{row.dish}</p></div>; })}</div>}
        </section>
      </>}
      <section className="px-4 pt-6">
        <h2 className="font-display text-xl font-bold">{t("Explore dishes")}</h2>
        {dishes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("No dishes are listed yet. Check back after kitchens publish their menus.")}</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dishes.map((dish) => <DishCard key={dish.id} dish={dish} />)}
          </div>
        )}
      </section>
      <section className="px-4 py-7">
        <h2 className="font-display text-xl font-bold">{t("Home kitchens")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {vendors.map((vendor) => (
            <Link key={vendor.id} to="/vendor/$id" params={{ id: vendor.id }} className="rounded-2xl border border-border bg-card p-4">
              <div className="font-display font-bold">{vendor.name}</div>
              {vendor.is_sample && <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{t("Sample kitchen")}</span>}
              {vendor.training_verified && <span className="mt-1 inline-block rounded-full bg-mehndi/10 px-2 py-0.5 text-xs font-semibold text-mehndi">{vendor.is_sample ? t("Demo training verified") : t("Training verified")}{vendor.verified_at ? ` ${new Date(vendor.verified_at).toLocaleDateString()}` : ""}</span>}
              <div className="text-sm text-muted-foreground">{vendor.chef} · {vendor.area}</div>
              <p className="mt-2 text-sm">{vendor.bio}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
