import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DishCard } from "@/components/DishCard";
import { api, type Dish } from "@/lib/api";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search dishes — NearBites" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [items, setItems] = useState<Dish[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(3);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (area.trim()) params.set("area", area.trim());
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
        params.set("radius_km", String(radius));
      }
      api.get<{ items: Dish[] }>("/dishes?" + params)
        .then((result) => {
          setItems(result.items);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, area, coords, radius]);

  return (
    <AppShell>
      <div className="px-4 pt-5">
        <h1 className="font-display text-2xl font-bold">Find your bite</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search dishes"
            className="rounded-full border border-border bg-card px-4 py-3 text-sm" />
          <input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Area, such as F-7"
            className="rounded-full border border-border bg-card px-4 py-3 text-sm" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => navigator.geolocation.getCurrentPosition(
            (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => setError("Location access was denied. You can still search by area."),
          )} className="rounded-full border border-border bg-card px-4 py-2">
            {coords ? "Location enabled" : "Use my location"}
          </button>
          {coords && (
            <label className="flex items-center gap-2">Within {radius} km
              <input type="range" min="1" max="10" value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
            </label>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <p className="mt-4 text-xs text-muted-foreground">{loading ? "Searching…" : items.length + " dishes to explore"}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((dish) => <DishCard key={dish.id} dish={dish} />)}
        </div>
        {!loading && items.length === 0 && !error && (
          <p className="mt-12 text-center text-sm text-muted-foreground">No available dishes match this search.</p>
        )}
      </div>
    </AppShell>
  );
}
