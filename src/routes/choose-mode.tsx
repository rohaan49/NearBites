import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChefHat, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "./signup";

export const Route = createFileRoute("/choose-mode")({
  head: () => ({ meta: [{ title: "Choose your workspace — NearBites" }] }),
  component: ChooseModePage,
});

function ChooseModePage() {
  const { user, hydrated, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role === "admin") navigate({ to: "/admin" });
    else if (!user.email_verified) navigate({ to: "/verify-email" });
  }, [hydrated, user, navigate]);

  const choose = async (workspace: "buyer" | "seller") => {
    setBusy(true);
    setError("");
    try {
      await switchWorkspace(workspace);
      navigate({ to: workspace === "seller" ? "/dashboard" : "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open workspace");
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="What would you like to do?" subtitle="Use either workspace with the same email and password.">
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3">
        <button disabled={busy} onClick={() => void choose("buyer")} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left hover:border-primary disabled:opacity-50">
          <ShoppingBag className="h-7 w-7 text-primary" />
          <span><strong className="block">Continue as buyer</strong><span className="text-sm text-muted-foreground">Browse kitchens, order meals, and see your orders.</span></span>
        </button>
        <button disabled={busy} onClick={() => void choose("seller")} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left hover:border-primary disabled:opacity-50">
          <ChefHat className="h-7 w-7 text-primary" />
          <span><strong className="block">Continue as seller</strong><span className="text-sm text-muted-foreground">Set up a kitchen or manage your existing one.</span></span>
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">You can switch later from your account. Selling requires training and approval.</p>
      <Link to="/account" className="mt-3 block text-center text-sm font-semibold text-primary">Account settings</Link>
    </AuthLayout>
  );
}
