import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthLayout, Field } from "./signup";
import { api } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — near bites" },
      { name: "description", content: "Request a password reset code for your near bites account." },
      { property: "og:title", content: "Reset your password — near bites" },
      { property: "og:description", content: "Request a password reset code for your near bites account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Reset your password — near bites" },
      { name: "twitter:description", content: "Send yourself a reset link and get back into your near bites account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (done)
    return (
      <AuthLayout title="Password changed">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-gradient-spice grid place-items-center text-primary-foreground shadow-warm">
            <MailCheck className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            You can now sign in with your new password.
          </p>
          <Link to="/login" className="mt-6 inline-flex rounded-xl bg-gradient-spice text-primary-foreground px-5 py-2.5 text-sm font-bold shadow-warm">
            Back to log in
          </Link>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout title="Forgot password?" subtitle="We'll email you a code to set a new password.">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            if (sent) {
              await api.post("/auth/password/reset", { email, code, new_password: password });
              setDone(true);
            } else {
              await api.post("/auth/password/forgot", { email });
              setSent(true);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Request failed");
          }
        }}
        className="space-y-3"
      >
        <Field label="Email">
          <input
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            required
          />
        </Field>
        {sent && (
          <>
            <p className="text-sm text-muted-foreground">If an account exists, Brevo sent a six-digit reset code to your inbox.</p>
            <Field label="Reset code">
              <input className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required />
            </Field>
            <Field label="New password">
              <input className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
            </Field>
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button className="w-full rounded-xl bg-gradient-spice text-primary-foreground py-3 font-display font-bold shadow-warm">
          {sent ? "Change password" : "Send reset code"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-semibold text-primary">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
