import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Admin sign-in — near bites" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role !== "admin") {
        await logout();
        setError("This account does not have admin access.");
        return;
      }
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 shadow-warm">
        <div className="h-12 w-12 rounded-2xl bg-gradient-spice text-primary-foreground grid place-items-center mb-4 shadow-warm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Admin sign-in</h1>
        <p className="text-sm text-muted-foreground mt-1">Restricted to platform owner.</p>

        <div className="mt-5 space-y-3">
          <label className="block text-xs font-semibold">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold">
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal" />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <button type="submit" disabled={loading}
          className="mt-5 w-full bg-gradient-spice text-primary-foreground rounded-xl py-2.5 text-sm font-semibold shadow-warm flex items-center justify-center gap-2 disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
      </form>
    </div>
  );
}
