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
  const { user } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [recommendations, setRecommendations] = useState<Dish[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api.get<{ items: Dish[] }>("/dishes?limit=12"),
      api.get<{ items: Vendor[] }>("/vendors?limit=10"),
    ])
      .then(([dishList, vendorList]) => {
        setDishes(dishList.items);
        setVendors(vendorList.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load kitchens"));
  }, []);
  useEffect(() => {
    if (!user) return;
    api.get<{ items: Dish[] }>("/users/me/recommendations?limit=3")
      .then((result) => setRecommendations(result.items))
      .catch(() => setRecommendations([]));
  }, [user]);

  return (
    <AppShell>
      <section className="relative mx-4 mt-4 overflow-hidden rounded-3xl bg-gradient-spice text-primary-foreground">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative p-7">
          <h1 className="font-display text-3xl font-bold">Ghar ka khana, delivered warm.</h1>
          <p className="mt-2 max-w-md text-sm">Explore Islamabad-inspired home menus. Sample kitchens are labeled and cannot take orders.</p>
          <Link to="/search" className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary">Explore dishes</Link>
        </div>
      </section>
      {error && <p className="mx-4 mt-5 text-sm text-destructive">{error}</p>}
      {recommendations.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="font-display text-xl font-bold">Picked for you</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((dish) => <DishCard key={dish.id} dish={dish} />)}
          </div>
        </section>
      )}
      <section className="px-4 pt-6">
        <h2 className="font-display text-xl font-bold">Explore dishes</h2>
        {dishes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No dishes are listed yet. Check back after kitchens publish their menus.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dishes.map((dish) => <DishCard key={dish.id} dish={dish} />)}
          </div>
        )}
      </section>
      <section className="px-4 py-7">
        <h2 className="font-display text-xl font-bold">Home kitchens</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {vendors.map((vendor) => (
            <Link key={vendor.id} to="/vendor/$id" params={{ id: vendor.id }} className="rounded-2xl border border-border bg-card p-4">
              <div className="font-display font-bold">{vendor.name}</div>
              {vendor.is_sample && <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">Sample kitchen</span>}
              <div className="text-sm text-muted-foreground">{vendor.chef} · {vendor.area}</div>
              <p className="mt-2 text-sm">{vendor.bio}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
