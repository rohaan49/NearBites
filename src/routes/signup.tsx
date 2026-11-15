import { LanguageSwitch, useLanguage } from "@/lib/language";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — near bites" },
      { name: "description", content: "One account for buying food and managing a home kitchen." },
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
  const { t } = useLanguage();
  const { signup } = useAuth();
  const navigate = useNavigate();
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
      await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: "buyer" });
      navigate({ to: "/verify-email" });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Could not create account" });
    }
  };

  return (
    <AuthLayout title={t("Create your account")} subtitle={t("Buy meals or set up your kitchen with the same login.")}>
      <form onSubmit={submit} className="space-y-3">
        {errors.form && <p className="text-xs text-destructive">{t(errors.form)}</p>}
        <Field label={t("Full name")} error={errors.name}>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ayesha Khan" />
        </Field>
        <Field label={t("Email")} error={errors.email}>
          <input className={input} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label={t("Password")} error={errors.password}>
          <input type="password" className={input} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label={t("Confirm password")} error={errors.confirm}>
          <input type="password" className={input} value={form.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="••••••••" />
        </Field>

        <button className="w-full rounded-xl bg-gradient-spice text-primary-foreground py-3 font-display font-bold shadow-warm">
          {t("Create account")}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t("Already have an account?")}{" "}
        <Link to="/login" className="font-semibold text-primary">
          {t("Log in")}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs font-medium text-destructive">{t(error)}</span>}
    </label>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex justify-end"><LanguageSwitch /></div>
        <Link to="/" dir="ltr" className="flex items-center justify-center gap-2">
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
