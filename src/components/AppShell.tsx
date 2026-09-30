import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Search, ShoppingBag, ClipboardList, User, BarChart3 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { count, addPulse, role } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const nav = [
    { to: "/", label: "Home", icon: Home },
    { to: "/search", label: "Search", icon: Search },
    { to: "/cart", label: "Cart", icon: ShoppingBag, badge: count },
    { to: "/orders", label: "Orders", icon: ClipboardList },
    role === "vendor" || role === "both" || user?.role === "seller"
      ? { to: "/dashboard", label: "Kitchen", icon: BarChart3 }
      : { to: "/account", label: "Me", icon: User },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-2xl md:max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-gradient-spice grid place-items-center text-primary-foreground font-display font-bold shadow-warm">
              n
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              near<span className="text-primary">bites</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition ${
                    active
                      ? "bg-gradient-spice text-primary-foreground shadow-warm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                  {"badge" in n && n.badge ? (
                    <span key={addPulse} className={`h-5 min-w-5 px-1 rounded-full bg-spice text-white text-[10px] font-bold grid place-items-center ${addPulse ? "cart-count-pop" : ""}`}>
                      {n.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {user ? (
            <div className="flex items-center gap-2">
              <Link to="/account" className="hidden sm:inline text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition">
                {user.name.split(" ")[0]} · {user.role === "admin" ? "Admin" : user.role === "seller" ? "Vendor" : "Foodie"}
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  navigate({ to: "/login" });
                }}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition">
                Log in
              </Link>
              <Link to="/signup" className="text-xs px-3 py-1.5 rounded-full bg-gradient-spice text-primary-foreground font-semibold shadow-warm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl md:max-w-5xl pb-24 md:pb-12">{children}</main>

      <nav className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md">

        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-full shadow-warm px-2 py-2 flex items-center justify-between">
          {nav.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`relative flex flex-col items-center justify-center px-3 py-1.5 rounded-full transition ${
                  active ? "bg-gradient-spice text-primary-foreground shadow-warm" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] mt-0.5 font-medium">{n.label}</span>
                {"badge" in n && n.badge ? (
                  <span key={addPulse} className={`absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-card bg-primary px-1 text-[11px] font-extrabold text-primary-foreground shadow-[0_3px_12px_rgba(125,48,22,.38)] ${addPulse ? "cart-count-pop" : ""}`}>
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
