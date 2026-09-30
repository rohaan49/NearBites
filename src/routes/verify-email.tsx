import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "./signup";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [
      { title: "Verify your email — near bites" },
      { name: "description", content: "Enter the 6-digit code we sent you to activate your near bites account." },
      { property: "og:title", content: "Verify your email — near bites" },
      { property: "og:description", content: "Enter the 6-digit code we sent you to activate your near bites account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Verify your email — near bites" },
      { name: "twitter:description", content: "Enter the 6-digit code we sent you to activate your near bites account." },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { user, hydrated, verifyEmail, resendEmail } = useAuth();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/signup" });
  }, [hydrated, user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    setDigits((d) => d.map((x, idx) => (idx === i ? clean : x)));
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.some((d) => !d)) {
      setError("Please enter all 6 digits.");
      return;
    }
    try {
      await verifyEmail(digits.join(""));
      navigate({ to: user?.role === "seller" ? "/seller-training" : "/" });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verification failed");
    }
  };

  return (
    <AuthLayout title="Verify your email" subtitle={`We sent a 6-digit code to ${user?.email ?? "your inbox"}.`}>
      <div className="mx-auto h-16 w-16 rounded-full bg-gradient-spice grid place-items-center text-primary-foreground shadow-warm">
        <MailCheck className="h-7 w-7" />
      </div>
      <form onSubmit={submit} className="mt-6">
        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              inputMode="numeric"
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
              }}
              className="h-14 w-full rounded-xl border border-border bg-card text-center font-display text-xl font-bold outline-none focus:border-primary transition"
            />
          ))}
        </div>
        {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
        <button className="mt-5 w-full rounded-xl bg-gradient-spice text-primary-foreground py-3 font-display font-bold shadow-warm">
          Verify email
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Didn't get it?{" "}
        <button
          disabled={cooldown > 0}
          onClick={async () => {
            try {
              await resendEmail();
              setCooldown(30);
              setError("");
            } catch (error) {
              setError(error instanceof Error ? error.message : "Could not resend code");
            }
          }}
          className="font-semibold text-primary disabled:text-muted-foreground"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Wrong email?{" "}
        <Link to="/signup" className="font-semibold text-primary">
          Start over
        </Link>
      </p>
    </AuthLayout>
  );
}
