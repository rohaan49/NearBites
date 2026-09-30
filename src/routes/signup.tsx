import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, type AuthRole } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ChefHat, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — near bites" },
      { name: "description", content: "Sign up as a foodie or a home vendor and start using near bites." },
      { property: "og:title", content: "Create your account — near bites" },
      { property: "og:description", content: "Sign up as a foodie or a home vendor and start using near bites." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Create your account — near bites" },
      { name: "twitter:description", content: "Sign up as a foodie or a home vendor and start using near bites." },
    ],
  }),
  component: SignupPage,
});

const input =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary transition";

function SignupPage() {
  const { signup } = useAuth();
  const { setRole } = useCart();
  const navigate = useNavigate();
  const [role, setLocalRole] = useState<AuthRole>("buyer");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!form.name.trim()) err.name = "Please enter your full name.";
    if (!form.email.trim()) err.email = "Please enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) err.email = "That doesn't look like a valid email.";
    if (!form.password) err.password = "Please choose a password.";
    else if (form.password.length < 10) err.password = "Use at least 10 characters.";
    if (form.confirm !== form.password) err.confirm = "Passwords don't match.";
    setErrors(err);
    if (Object.keys(err).length) return;

    try {
      await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password, role });
      setRole(role === "seller" ? "vendor" : "student");
      navigate({ to: "/verify-email" });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Could not create account" });
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Real desi home cooking, a few taps away.">
      <div className="grid grid-cols-2 gap-2 p-1 bg-secondary rounded-2xl">
        {([
          { id: "buyer" as const, label: "I'm a Buyer", Icon: GraduationCap },
          { id: "seller" as const, label: "I'm a Vendor", Icon: ChefHat },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setLocalRole(t.id)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              role === t.id ? "bg-gradient-spice text-primary-foreground shadow-warm" : "text-muted-foreground"
            }`}
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}
        <Field label="Full name" error={errors.name}>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ayesha Khan" />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={input} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" error={errors.password}>
          <input type="password" className={input} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <input type="password" className={input} value={form.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="••••••••" />
        </Field>

        <button className="w-full rounded-xl bg-gradient-spice text-primary-foreground py-3 font-display font-bold shadow-warm">
          Create account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs font-medium text-destructive">{error}</span>}
    </label>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2">
          <span className="h-9 w-9 rounded-full bg-gradient-spice grid place-items-center text-primary-foreground font-display font-bold shadow-warm">n</span>
          <span className="font-display text-xl font-bold tracking-tight">
            near<span className="text-primary">bites</span>
          </span>
        </Link>
        <div className="mt-6 bg-card border border-border rounded-3xl p-6 shadow-soft">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
