import { LanguageSwitch, useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/admin-invite")({
  head: () => ({ meta: [{ title: "Accept admin invitation — NearBites" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminInvite,
});

function AdminInvite() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ email: "", code: "", name: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6">
        <div className="mb-4 flex justify-end"><LanguageSwitch /></div>
        <h1 className="font-display text-2xl font-bold">{t("Accept admin invitation")}</h1>
        {done ? (
          <p className="mt-4 text-sm">{t("Your admin account is active.")} <Link to="/admin-login" className="text-primary underline">{t("Sign in")}</Link>.</p>
        ) : (
          <form onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api.post("/auth/admin-invite/accept", form);
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not accept invitation");
            }
          }} className="mt-5 space-y-3">
            {(["email", "code", "name", "password"] as const).map((key) => (
              <label key={key} className="block text-sm">{t({ email: "Email", code: "Verification code", name: "Name", password: "Password" }[key])}
                <input required type={key === "password" ? "password" : key === "email" ? "email" : "text"}
                  minLength={key === "password" ? 10 : undefined}
                  value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" />
              </label>
            ))}
            {error && <p className="text-sm text-destructive">{t(error)}</p>}
            <button className="w-full rounded-xl bg-gradient-spice py-3 font-semibold text-white">{t("Activate account")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
