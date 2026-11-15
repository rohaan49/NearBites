import { useLanguage } from "@/lib/language";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthLayout, Field } from "./signup";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — near bites" },
      { name: "description", content: "Log in to order home-cooked desi food or manage your home kitchen." },
      { property: "og:title", content: "Log in — near bites" },
      { property: "og:description", content: "Log in to order home-cooked desi food or manage your home kitchen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Log in — near bites" },
      { name: "twitter:description", content: "Log in to order home-cooked desi food or manage your home kitchen." },
    ],
  }),
  component: LoginPage,
});

const input =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary transition";

function LoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!form.email.trim()) err.email = "Please enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) err.email = "That doesn't look like a valid email.";
    if (!form.password) err.password = "Please enter your password.";
    setErrors(err);
    if (Object.keys(err).length) return;

    try {
      const user = await login(form.email, form.password);
      if (!user.email_verified) return navigate({ to: "/verify-email" });
      navigate({ to: user.role === "admin" ? "/admin" : "/choose-mode" });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Sign-in failed" });
    }
  };

  return (
    <AuthLayout title={t("Welcome back")} subtitle={t("Log in to pick up where you left off.")}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("Email")} error={errors.email}>
          <input className={input} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
        </Field>
        <Field label={t("Password")} error={errors.password}>
          <input type="password" className={input} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
        </Field>
        {errors.form && <p className="text-xs font-medium text-destructive">{t(errors.form)}</p>}
        <button className="w-full rounded-xl bg-gradient-spice text-primary-foreground py-3 font-display font-bold shadow-warm">{t("Log in")}</button>
      </form>

      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          {t("Forgot password?")}
        </Link>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("New to near bites?")}{" "}
        <Link to="/signup" className="font-semibold text-primary">
          {t("Create an account")}
        </Link>
      </p>
    </AuthLayout>
  );
}
