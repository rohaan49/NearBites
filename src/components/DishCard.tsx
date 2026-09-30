import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import type { Dish } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function DishCard({ dish }: { dish: Dish }) {
  const { add } = useCart();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmAdd = () => {
    add(dish);
    setConfirmOpen(false);
  };

  return (
    <article className="bg-card rounded-3xl overflow-hidden border border-border shadow-soft">
      <Link to="/vendor/$id" params={{ id: dish.vendor_id }} className="block aspect-[4/3] bg-secondary">
        {dish.image_url ? (
          <img src={dish.image_url} alt={dish.is_sample ? `Illustrative ${dish.name} photo` : dish.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full grid place-items-center text-5xl" aria-label="No dish photo yet">🍽️</div>
        )}
      </Link>
      <div className="p-4">
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-lg">{dish.name}</h3>
            {dish.is_sample && <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">Sample menu</span>}
            {dish.is_demo && !dish.is_sample && <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Order flow test</span>}
            <Link to="/vendor/$id" params={{ id: dish.vendor_id }} className="text-sm text-muted-foreground hover:text-primary">
              {dish.vendor_name}
            </Link>
          </div>
          <div className="font-display font-bold text-primary whitespace-nowrap">Rs {dish.price_pkr}</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <MapPin className="inline h-3 w-3" /> {dish.area}
          {dish.distance_km !== null && dish.distance_km !== undefined ? " · " + dish.distance_km + " km away" : ""}
          {dish.is_sample ? " · Preview only" : " · " + dish.portions_available + " portions available"}
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={dish.is_sample || dish.portions_available === 0}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-gradient-spice px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {!dish.is_sample && <Plus className="h-4 w-4" />} {dish.is_sample ? "Not available to order" : "Add to cart"}
        </button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-none bg-card p-0 shadow-2xl">
          <div className="dish-confirm-bounce">
            <div className="aspect-[16/9] bg-secondary">
              {dish.image_url ? <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-6xl" aria-hidden="true">🍽️</div>}
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Confirm your cart item</p>
                <DialogTitle className="mt-2 font-display text-2xl leading-tight">{dish.name}</DialogTitle>
                <DialogDescription className="mt-1">Prepared by {dish.vendor_name} · {dish.area}</DialogDescription>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{dish.description}</p>
              {dish.is_demo && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">Order flow test: this exercises checkout only. No meal will be prepared or delivered.</p>}
              <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-3 text-sm">
                <span>1 {dish.portion_size} portion</span>
                <strong className="text-base">Rs {dish.price_pkr}</strong>
              </div>
              <p className="text-xs text-muted-foreground">{dish.portions_available} portions listed as available. You can review your cart before placing an order.</p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button type="button" onClick={confirmAdd} className="flex-1 rounded-full bg-gradient-spice px-5 py-3 text-sm font-bold text-primary-foreground">Confirm add to cart</button>
                <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-full border border-border px-5 py-3 text-sm font-semibold">Keep browsing</button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
