import { LanguageSwitch, useLanguage } from "@/lib/language";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE, api, readSession } from "@/lib/api";
import { BarChart3, BookOpenCheck, ChevronRight, ClipboardList, LayoutDashboard, Settings2, ShieldAlert, ShoppingBag, Store, Users, UtensilsCrossed } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — NearBites" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminPage,
});

type Kitchen = { id: string; name: string; chef: string; area: string; bio: string; status: string; is_demo: boolean; training_verified: boolean; location_set: boolean; created_at: string; retraining_at: string | null };
type Listing = { id: string; name: string; description: string; image_url: string | null; vendor_id: string; vendor_name: string; area: string; status: string; is_demo: boolean; price_pkr: number; portion_size: string; portions_available: number; created_at: string };
type Proof = { id: string; user_id: string; seller_name?: string; kitchen_name?: string; is_demo?: boolean; module_id: string; filename: string; content_type?: string; status: string; reason: string | null; submitted_at: string; camera_check: { model: string; confidence_threshold: number; detections: { label: string; confidence: number }[]; checked_at: string } | null };
type KitchenReview = { kitchen: Kitchen; seller: { name: string; email: string; email_verified: boolean } | null; modules: { id: string; title: string; proof_instruction: string; question_count: number; questions: { question: string; correct_answer: string }[]; progress: { quiz_passed: boolean; proof_status: string; acknowledged: boolean; completed: boolean }; quiz_attempts: { id: string; score: number; passed: boolean; submitted_at: string }[]; proofs: Proof[] }[] };
type Flag = { id: string; vendor_id: string; order_id: string; description: string; created_at: string; is_demo: boolean };
type AdminOrder = { id: string; vendor_id: string; vendor_name: string; buyer_id: string; buyer_name: string; status: string; payment_status: string; total_pkr: number; placed_at: string; is_demo: boolean };
type Overview = { delivered_orders: number; orders_placed: number; buyers_ordering: number; average_paid_order_pkr: number; revenue_pkr: number; active_vendors: number; pending_listings: number; pending_proofs: number; open_hygiene_reports: number; overdue_reviews: number; daily: { day: string; orders: number; revenue_pkr: number }[] };
type Activity = { items: { at: string; kind: string; title: string; detail: string }[]; definition: string };
type Analytics = { leaderboard: { vendors: { vendor_id: string; name: string; revenue_pkr: number; orders: number }[]; dishes: { dish_id: string; name: string; portions_sold: number }[] }; demand: { areas: { area: string; orders: number }[]; heatmap: { weekday: number; hour: number; orders: number }[]; daily: { day: string; orders: number; revenue_pkr: number }[] }; revenue: { total_pkr: number; daily: { day: string; orders: number; revenue_pkr: number }[]; areas: { area: string; revenue_pkr: number }[] }; training: { seller_count: number; verified_count: number; pending_proofs: number; modules: { module_id: string; title: string; started: number; quiz_passed: number; completed: number }[] }; health: { areas: { area: string; delivered_orders_to_area: number; available_verified_kitchens_in_area: number; orders_per_available_kitchen: number | null }[]; seller_trajectories: { kitchen_id: string; name: string; previous_30_days: number; recent_30_days: number; trajectory: string }[]; notes: string }; chefcam: { mode: string; rule: string; proofs_with_model_evidence: number; would_approve: number; would_approve_reviewed: number; human_rejections_among_would_approve: number; note: string } };
type Cohorts = { cohorts: { signup_month: string; buyers: number; weeks: { week: number; eligible_buyers: number; buyers_with_delivered_order: number; rate: number | null }[] }[]; definition: string };
type ReviewOperations = { by_type: { type: string; completed_reviews: number; average_wait_hours: number | null }[] };
type VerificationOutcomes = { groups: { group: string; kitchens: number; delivered_orders: number; buyer_reports: number; reports_per_100_delivered_orders: number | null }[]; note: string };
type Settings = { hygiene_flag_threshold: number; review_sla_hours: number; notifications_enabled: boolean };
type ReviewQueueItem = { type: "kitchen" | "listing" | "proof" | "hygiene"; id: string; title: string; kitchen_id: string; kitchen_name: string; seller_tier: string; created_at: string; waiting_hours: number; overdue: boolean; priority: "urgent" | "high" | "routine"; reasons: string[]; reviewer_id: string | null; reviewer_name: string | null; application?: { ready: boolean; requirements: { email_verified: boolean; location_set: boolean; training_complete: boolean }; lessons: { id: string; title: string; quiz_passed: boolean; proof_status: string; acknowledged: boolean; completed: boolean }[] } | null };
type ReviewQueue = { items: ReviewQueueItem[]; summary: { open: number; overdue: number; unassigned: number; urgent: number } };

const panel = "rounded-xl border border-[#dfe6de] bg-white shadow-sm";
const primaryButton = "rounded-lg bg-[#315e42] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#254d35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42] disabled:opacity-50";
const quietButton = "rounded-lg border border-[#d4ded4] px-4 py-2.5 text-sm font-semibold text-[#315e42] transition-colors hover:bg-[#eef4ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42]";
const dangerButton = "rounded-lg border border-[#dfc4bf] px-4 py-2.5 text-sm font-semibold text-[#9c403b] transition-colors hover:bg-[#fff3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9c403b]";
const inputClass = "mt-1.5 w-full rounded-lg border border-[#dce3dc] bg-white px-3 py-2.5 text-sm outline-none focus-visible:border-[#38674a] focus-visible:ring-2 focus-visible:ring-[#38674a]/20";

function SectionHeading({ title, description, count }: { title: string; description: string; count?: number }) {
  const { t } = useLanguage();
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-[#66716a]">{description}</p></div>{count !== undefined && <span className="text-sm tabular-nums text-[#536158]">{count} {count === 1 ? t("item") : t("items")}</span>}</div>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className={`${panel} px-6 py-14 text-center`}><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-[#66716a]">{detail}</p></div>;
}

function AdminAnalyticsCharts({ analytics }: { analytics: Analytics }) {
  const { t } = useLanguage();
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const periods = [{ label: "6–9am", start: 6 }, { label: "9am–12pm", start: 9 }, { label: "12–3pm", start: 12 }, { label: "3–6pm", start: 15 }, { label: "6–9pm", start: 18 }, { label: "9pm–12am", start: 21 }];
  const valueAt = (day: number, hour: number) => analytics.demand.heatmap.filter((row) => row.weekday === day && row.hour >= hour && row.hour < hour + 3).reduce((sum, row) => sum + row.orders, 0);
  const maxDemand = Math.max(1, ...analytics.demand.heatmap.map((row) => row.orders));
  const topDishes = analytics.leaderboard.dishes.slice(0, 8);
  const trainingRows = analytics.training.modules.map((row) => ({ ...row, title: t(row.title) }));
  const areaRows = analytics.demand.areas.slice(0, 8).map((area) => ({ area: area.area, orders: area.orders, revenue: analytics.revenue.areas.find((row) => row.area === area.area)?.revenue_pkr ?? 0 }));
  return <div className="mt-5 grid gap-5 lg:grid-cols-2">
    <section className={`${panel} p-5`}><h3 className="font-display text-lg font-bold">{t("Top dishes this period")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Delivered portions across the selected marketplace data.")}</p>{topDishes.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={topDishes} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid stroke="#eadfd3" strokeDasharray="4 4" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="portions_sold" name={t("Portions sold")} fill="#c8471c" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-5 text-sm text-[#66716a]">{t("No delivered dish orders in this period.")}</p>}</section>
    <section className={`${panel} p-5`}><h3 className="font-display text-lg font-bold">{t("Orders are growing")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Delivered orders per day.")}</p>{analytics.demand.daily.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.demand.daily}><defs><linearGradient id="demandOrderFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8471c" stopOpacity={0.32} /><stop offset="95%" stopColor="#c8471c" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#eadfd3" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="day" tickFormatter={(day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} tick={{ fontSize: 11 }} minTickGap={25} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} /><Tooltip labelFormatter={(day) => new Date(`${day}T12:00:00`).toLocaleDateString()} /><Area type="monotone" dataKey="orders" stroke="#b83d17" strokeWidth={3} fill="url(#demandOrderFill)" /></AreaChart></ResponsiveContainer></div> : <p className="mt-5 text-sm text-[#66716a]">{t("No daily orders in this period.")}</p>}</section>
    <section className={`${panel} p-5`}><h3 className="font-display text-lg font-bold">{t("When the city orders")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Delivered orders by weekday and three-hour period.")}</p><div className="mt-4 overflow-x-auto"><div className="min-w-[640px]"><div className="grid grid-cols-[44px_repeat(6,minmax(0,1fr))] gap-1.5 text-center text-[11px] text-[#66716a]"><span />{periods.map((period) => <span key={period.label}>{period.label}</span>)}</div>{weekdays.map((day, index) => <div key={day} className="mt-1.5 grid grid-cols-[44px_repeat(6,minmax(0,1fr))] items-center gap-1.5"><span className="text-xs font-semibold text-[#526056]">{t(day)}</span>{periods.map((period) => { const count = valueAt(index, period.start); return <div key={period.label} title={`${day} ${period.label}: ${count} orders`} className="rounded-lg py-3 text-xs font-semibold" style={{ backgroundColor: `rgba(190, 65, 25, ${0.08 + 0.82 * count / maxDemand})`, color: count / maxDemand > 0.52 ? "#fff" : "#58392e" }}>{count}</div>; })}</div>)}</div></div></section>
    <section className={`${panel} p-5`}><h3 className="font-display text-lg font-bold">{t("Neighbourhood demand")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Orders and paid order value by kitchen area. Commission is not recorded in this app.")}</p>{areaRows.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={areaRows} margin={{ left: 4, right: 16 }}><CartesianGrid stroke="#eadfd3" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="area" tick={{ fontSize: 11 }} /><YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><YAxis yAxisId="value" orientation="right" hide /><Tooltip formatter={(value, name) => name === t("Paid order value") ? [`Rs ${Number(value).toLocaleString()}`, name] : [value, name]} /><Bar yAxisId="orders" dataKey="orders" name={t("Orders")} fill="#c8471c" radius={[6, 6, 0, 0]} /><Bar yAxisId="value" dataKey="revenue" name={t("Paid order value")} fill="#d98754" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-5 text-sm text-[#66716a]">{t("No area data for this period.")}</p>}</section>
    <section className={`${panel} p-5 lg:col-span-2`}><h3 className="font-display text-lg font-bold">{t("Seller training funnel")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Kitchens that attempted the quiz, passed it, and completed the lesson. Demo view is fictional.")}</p>{trainingRows.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={trainingRows} margin={{ left: 4, right: 12, bottom: 8 }}><CartesianGrid stroke="#eadfd3" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="title" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><Tooltip /><Bar dataKey="started" name={t("Started")} fill="#e9b598" radius={[5, 5, 0, 0]} /><Bar dataKey="quiz_passed" name={t("Quiz passed")} fill="#d8794e" radius={[5, 5, 0, 0]} /><Bar dataKey="completed" name={t("Completed")} fill="#a93618" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-5 text-sm text-[#66716a]">{t("No training module activity in this view.")}</p>}</section>
  </div>;
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const { t } = useLanguage();
  const tones = { neutral: "bg-[#eef1ed] text-[#526056]", success: "bg-[#e4f0e6] text-[#2c6040]", warning: "bg-[#fff0d8] text-[#8a5d1b]", danger: "bg-[#fff0ec] text-[#a4473e]" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones[tone]}`}>{t(label.replaceAll("_", " "))}</span>;
}

function ProofPreview({ proof }: { proof: Proof }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    const fetchProof = async () => {
      try {
        let token = readSession()?.access_token;
        if (!token) throw new Error("Sign in to view this evidence");
        let response = await fetch(`${API_BASE}/training/proofs/${proof.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
        if (response.status === 401) {
          await api.get("/users/me");
          token = readSession()?.access_token;
          if (!token) throw new Error("Sign in to view this evidence");
          response = await fetch(`${API_BASE}/training/proofs/${proof.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
        }
        if (!response.ok) throw new Error("Evidence file could not be loaded");
        objectUrl = URL.createObjectURL(await response.blob());
        if (alive) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Evidence file could not be loaded");
      }
    };
    void fetchProof();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [proof.id]);

  if (error) return <p className="mt-2 text-sm text-destructive">{t(error)}</p>;
  if (!url) return <p className="mt-2 text-sm text-muted-foreground">{t("Loading evidence…")}</p>;
  return <div className="mt-2">
    {proof.content_type?.startsWith("video/") ? <video src={url} controls className="max-h-80 w-full max-w-xl rounded-xl bg-black" /> : <img src={url} alt={`${proof.module_id} evidence uploaded by seller`} className="max-h-96 w-full max-w-xl rounded-xl border border-border object-contain" />}
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary underline">{t("Open full evidence")}</a>
  </div>;
}

const tabs = ["overview", "review-queue", "kitchens", "buyers", "listings", "proofs", "hygiene", "orders", "analytics", "settings", "team"] as const;
type Tab = typeof tabs[number];
const tabMeta = {
  overview: { label: "Overview", icon: LayoutDashboard, description: "Platform activity and priorities" },
  "review-queue": { label: "Review queue", icon: ClipboardList, description: "Priority, ownership, and waiting time" },
  kitchens: { label: "Kitchens", icon: Store, description: "Review sellers, training, and evidence" },
  buyers: { label: "Users", icon: Users, description: "Registered accounts" },
  listings: { label: "Listings", icon: UtensilsCrossed, description: "Dishes awaiting a decision" },
  proofs: { label: "Proof queue", icon: BookOpenCheck, description: "Training evidence awaiting review" },
  hygiene: { label: "Hygiene", icon: ShieldAlert, description: "Reports and seller watchlist" },
  orders: { label: "Orders", icon: ShoppingBag, description: "Fulfilment and cash collection" },
  analytics: { label: "Analytics", icon: BarChart3, description: "Platform trends" },
  settings: { label: "Settings", icon: Settings2, description: "Platform rules" },
  team: { label: "Team", icon: ClipboardList, description: "Admin access" },
};

function AdminPage() {
  const { t } = useLanguage();
  const { user, hydrated, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("review-queue");
  const [demoScope, setDemoScope] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [overviewRange, setOverviewRange] = useState<"today" | "week" | "month">("month");
  const [analyticsRange, setAnalyticsRange] = useState<"today" | "week" | "month">("month");
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [selectedKitchen, setSelectedKitchen] = useState<string | null>(null);
  const [review, setReview] = useState<KitchenReview | null>(null);
  const [kitchenFilter, setKitchenFilter] = useState<"real" | "pending" | "sample">("sample");
  const [kitchenSearch, setKitchenSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [buyers, setBuyers] = useState<{ id: string; name: string; email: string; role: string; email_verified: boolean; is_sample: boolean; orders: number }[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [watchlist, setWatchlist] = useState<{ vendor_id: string; name: string; open_flags: number }[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cohorts, setCohorts] = useState<Cohorts | null>(null);
  const [reviewOperations, setReviewOperations] = useState<ReviewOperations | null>(null);
  const [verificationOutcomes, setVerificationOutcomes] = useState<VerificationOutcomes | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [admins, setAdmins] = useState<{ id: string; name: string; email: string }[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (hydrated && user?.role !== "admin") navigate({ to: "/admin-login" });
  }, [hydrated, user, navigate]);

  const load = async () => {
    if (user?.role !== "admin") return;
    try {
      if (tab === "overview") {
        const [summary, kitchenRows, recent] = await Promise.all([api.get<Overview>(`/admin/overview?demo=${demoScope}&range=${overviewRange}`), api.get<{ items: Kitchen[] }>("/admin/kitchens"), api.get<Activity>(`/admin/analytics/activity?demo=${demoScope}`)]);
        setOverview(summary);
        setKitchens(kitchenRows.items);
        setActivity(recent);
      }
      if (tab === "review-queue") {
        const [queue, reviewers] = await Promise.all([
          api.get<ReviewQueue>(`/admin/review-queue?demo=${demoScope}`),
          api.get<{ items: typeof admins }>("/admin/users"),
        ]);
        setReviewQueue(queue);
        setAdmins(reviewers.items);
      }
      if (tab === "kitchens") setKitchens((await api.get<{ items: Kitchen[] }>("/admin/kitchens")).items.sort((a, b) => Number(a.status === "sample") - Number(b.status === "sample")));
      if (tab === "buyers") setBuyers((await api.get<{ items: typeof buyers }>("/admin/buyers")).items);
      if (tab === "listings") setListings((await api.get<{ items: Listing[] }>("/admin/listings?status=pending_review")).items);
      if (tab === "proofs") setProofs((await api.get<{ items: Proof[] }>("/admin/training/proofs?status=pending")).items);
      if (tab === "hygiene") {
        const [reports, watched] = await Promise.all([
          api.get<{ items: Flag[] }>("/admin/hygiene/flags"),
          api.get<{ items: typeof watchlist }>("/admin/hygiene/watchlist"),
        ]);
        setFlags(reports.items);
        setWatchlist(watched.items);
      }
      if (tab === "orders") setOrders((await api.get<{ items: AdminOrder[] }>("/admin/orders")).items);
      if (tab === "settings") setSettings(await api.get<Settings>("/admin/settings"));
      if (tab === "team") setAdmins((await api.get<{ items: { id: string; name: string; email: string }[] }>("/admin/users")).items);
      if (tab === "analytics") {
        const [leaderboard, demand, revenue, training, health, chefcam, buyerCohorts, reviewStats, verificationStats] = await Promise.all([
          api.get(`/admin/analytics/leaderboard?demo=${demoScope}&range=${analyticsRange}`),
          api.get(`/admin/analytics/demand?demo=${demoScope}&range=${analyticsRange}`),
          api.get(`/admin/analytics/revenue?demo=${demoScope}&range=${analyticsRange}`),
          api.get(`/admin/analytics/training?demo=${demoScope}`),
          api.get(`/admin/analytics/marketplace-health?demo=${demoScope}`),
          api.get(`/admin/analytics/chefcam-shadow?demo=${demoScope}`),
          api.get<Cohorts>(`/admin/analytics/buyer-cohorts?demo=${demoScope}`),
          api.get<ReviewOperations>(`/admin/analytics/review-operations?demo=${demoScope}`),
          api.get<VerificationOutcomes>(`/admin/analytics/verification-outcomes?demo=${demoScope}`),
        ]);
        setAnalytics({ leaderboard, demand, revenue, training, health, chefcam } as Analytics);
        setCohorts(buyerCohorts);
        setReviewOperations(reviewStats);
        setVerificationOutcomes(verificationStats);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin data");
    }
  };
  useEffect(() => { void load(); }, [tab, user, demoScope, overviewRange, analyticsRange]);
  const visibleKitchens = kitchens.filter((kitchen) => {
    if (kitchen.is_demo !== demoScope) return false;
    if (!demoScope && kitchenFilter === "pending" && kitchen.status !== "pending") return false;
    return `${kitchen.name} ${kitchen.chef} ${kitchen.area}`.toLowerCase().includes(kitchenSearch.toLowerCase());
  });
  const visibleListings = listings.filter((item) => item.is_demo === demoScope);
  const visibleProofs = proofs.filter((proof) => Boolean(proof.is_demo) === demoScope);
  const visibleFlags = flags.filter((flag) => flag.is_demo === demoScope);
  const visibleOrders = orders.filter((order) => order.is_demo === demoScope);

  const action = async (path: string, body: unknown, method: "post" | "patch" = "post") => {
    try {
      if (method === "patch") await api.patch(path, body);
      else await api.post(path, body);
      setMessage("Saved.");
      await load();
      if (selectedKitchen) setReview(await api.get<KitchenReview>(`/admin/kitchens/${selectedKitchen}/review`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const showKitchen = async (id: string) => {
    setSelectedKitchen(id);
    setReview(null);
    setError("");
    try {
      const nextReview = await api.get<KitchenReview>(`/admin/kitchens/${id}/review`);
      setReview(nextReview);
      setSelectedModule(nextReview.modules.find((module) => module.progress.proof_status === "pending")?.id || nextReview.modules[0]?.id || null);
    } catch (err) {
      setSelectedKitchen(null);
      setError(err instanceof Error ? err.message : "Could not load kitchen review");
    }
  };

  const reject = (path: string) => {
    const reason = window.prompt(t("Reason for rejection"));
    if (reason?.trim()) void action(path, { decision: "reject", reason: reason.trim() });
  };

  if (!hydrated || user?.role !== "admin") return null;

  return (
    <div className="admin-shell min-h-dvh bg-[#f7f6f2] text-[#252927] lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="border-b border-[#e4e7e3] bg-[#f0f3ef] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-7">
          <div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b786e]">NearBites</div><div className="mt-1 text-lg font-bold tracking-tight">{t("Admin workspace")}</div></div>
          <span className="rounded-md bg-[#dce6dc] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#385b43]">{["settings", "team"].includes(tab) ? t("Admin") : demoScope ? t("Demo") : t("Live")}</span>
        </div>
        <nav aria-label={t("Admin sections")} className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pt-3">
          {tabs.map((name) => { const Icon = tabMeta[name].icon; return (
            <button key={name} type="button" onClick={() => { setTab(name); setError(""); setMessage(""); }} aria-current={tab === name ? "page" : undefined}
              className={"flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#345e43] lg:w-full " + (tab === name ? "bg-[#dce8de] text-[#204a33]" : "text-[#536158] hover:bg-[#e6ebe5] hover:text-[#252927]")}>
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{t(tabMeta[name].label)}</span>
            </button>
          ); })}
        </nav>
        <div className="hidden border-t border-[#dce2db] px-6 py-5 text-xs text-[#66746a] lg:mt-auto lg:block">{t("Signed in as")}<br /><strong className="mt-1 block truncate font-medium text-[#34473b]">{user.email}</strong></div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e8e3] bg-white/80 px-5 py-5 sm:px-8">
          <div><h1 className="text-xl font-bold tracking-tight">{t(tabMeta[tab].label)}</h1><p className="mt-0.5 text-sm text-[#66716a]">{t(tabMeta[tab].description)}</p></div>
          <div className="flex flex-wrap items-center gap-4 text-sm"><LanguageSwitch />{!["settings", "team"].includes(tab) && <button type="button" onClick={() => { setDemoScope(!demoScope); setKitchenFilter(demoScope ? "real" : "sample"); setSelectedKitchen(null); setReview(null); }} className="rounded-lg border border-[#cad9ca] bg-[#edf3eb] px-3 py-2 text-xs font-semibold text-[#315e42]">{demoScope ? t("Demo data · switch to live") : t("Live data · switch to demo")}</button>}<Link to="/" className="font-medium text-[#345e43] hover:underline">{t("Marketplace")}</Link><button onClick={async () => { await logout(); navigate({ to: "/admin-login" }); }} className="text-[#66716a] hover:text-[#29372d]">{t("Sign out")}</button></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:py-8">
        {demoScope && !["settings", "team"].includes(tab) && <p className="mb-5 rounded-lg border border-[#e5d5a8] bg-[#fff7de] px-4 py-3 text-sm text-[#765821]"><strong>{t("Demo data view.")}</strong> {t("These sample accounts, proofs, listings, orders, reports, and figures are fictional presentation content.")}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{t(error)}</p>}
        {message && <p className="mt-3 text-sm text-mehndi">{t(message)}</p>}
        {tab === "overview" && overview && (
          <section>
            <SectionHeading title={t("Today at a glance")} description={demoScope ? t("Fictional activity for a complete presentation.") : t("Live operations, with the items that need an admin decision first.")} />
            <div className="mb-5 inline-flex rounded-full border border-[#dfe6de] bg-white p-1" aria-label={t("Overview date range")}>{([ ["today", "Today"], ["week", "This week"], ["month", "This month"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={overviewRange === value} onClick={() => setOverviewRange(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${overviewRange === value ? "bg-[#a82d13] text-white" : "text-[#59655c] hover:bg-[#f2f5f0]"}`}>{t(label)}</button>)}</div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Orders placed", overview.orders_placed], ["Buyers ordering", overview.buyers_ordering], ["Active kitchens", overview.active_vendors], ["Average paid order", `Rs ${overview.average_paid_order_pkr.toLocaleString()}`]].map(([label, value]) => <div key={label} className={`${panel} rounded-2xl p-5`}><p className="text-sm text-[#66716a]">{t(String(label))}</p><p className="mt-2 font-display text-3xl font-bold tabular-nums text-[#38261f]">{value}</p></div>)}</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: demoScope ? "Demo kitchens" : "Pending kitchen decisions", value: demoScope ? kitchens.filter((k) => k.is_demo).length : kitchens.filter((k) => k.status === "pending").length, target: "kitchens" as Tab, note: "Review sellers" },
                { label: "Training proofs", value: overview.pending_proofs, target: "proofs" as Tab, note: "Inspect evidence" },
                { label: "Dish listings", value: overview.pending_listings, target: "listings" as Tab, note: "Check new dishes" },
                { label: "Hygiene reports", value: overview.open_hygiene_reports, target: "hygiene" as Tab, note: "Read reports" },
              ].map((item) => <button key={item.label} onClick={() => setTab(item.target)} className={`${panel} p-5 text-start transition-colors hover:border-[#8aa88e] hover:bg-[#fbfdf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42]`}><span className="text-sm font-medium text-[#66716a]">{t(item.label)}</span><span className="mt-2 block text-3xl font-semibold tabular-nums text-[#203f2e]">{item.value}</span><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#315e42]">{t(item.note)}<ChevronRight className="rtl:rotate-180" size={14} aria-hidden="true" /></span></button>)}
            </div>
            {overview.overdue_reviews > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e9d8b9] bg-[#fff7e9] px-5 py-4"><div><p className="font-semibold text-[#765821]">{overview.overdue_reviews} {t("reviews past the target time")}</p><p className="mt-0.5 text-sm text-[#816d4b]">{t("Open proof and listing queues to clear them.")}</p></div><button onClick={() => setTab("proofs")} className={quietButton}>{t("Open proof queue")}</button></div>}
            <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className={`${panel} p-5 sm:p-6`}><h3 className="font-display text-lg font-bold">{t("How orders are moving")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Daily delivered orders and paid order value ·")} {overviewRange === "today" ? t("today") : overviewRange === "week" ? t("last 7 days") : t("last 30 days")}</p><p className="mt-4 text-2xl font-semibold tabular-nums">{t("Rs")} {overview.revenue_pkr.toLocaleString()} <span className="text-sm font-normal text-[#66716a]">{t("paid order value")}</span></p>{overview.daily.length > 0 ? <div className="mt-3 h-64 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={overview.daily}><defs><linearGradient id="adminOrdersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9471a" stopOpacity={0.35} /><stop offset="95%" stopColor="#c9471a" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#eadfd3" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="day" tickFormatter={(day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} tick={{ fontSize: 11 }} minTickGap={24} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} /><Tooltip labelFormatter={(day) => new Date(`${day}T12:00:00`).toLocaleDateString()} /><Area type="monotone" dataKey="orders" stroke="#b93b15" strokeWidth={3} fill="url(#adminOrdersFill)" /></AreaChart></ResponsiveContainer></div> : <p className="mt-6 text-sm text-[#66716a]">{t("No delivered orders in this period.")}</p>}</div>
              <div className={`${panel} p-5 sm:p-6`}><h3 className="font-semibold">{t("Review sequence")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("A clear path for each new seller.")}</p><ol className="mt-5 space-y-4">{[["1", "Review the kitchen", "Check seller identity and kitchen details."], ["2", "Inspect training proof", "Read quiz scores and open each submitted image."], ["3", "Decide on listings", "Publish dishes only when the kitchen and training are approved."]].map(([number,title,detail]) => <li key={number} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e4eee3] text-xs font-bold text-[#315e42]">{number}</span><span><strong className="text-sm">{title}</strong><span className="mt-0.5 block text-xs text-[#66716a]">{detail}</span></span></li>)}</ol></div>
            </div>
            <section className={`${panel} mt-5 p-5 sm:p-6`}><h3 className="font-display text-lg font-bold">{t("Latest activity")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Recent order, hygiene, kitchen, and training events. Buyer identities are omitted.")}</p>{activity?.items.length ? <div className="mt-4 divide-y divide-[#e9ede7]">{activity.items.map((item, index) => <div key={`${item.at}-${index}`} className="flex gap-3 py-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === "hygiene" ? "bg-red-500" : item.kind === "kitchen" ? "bg-amber-500" : "bg-emerald-600"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{t(item.title)}</p><p className="mt-0.5 text-sm text-[#66716a]">{item.detail}</p></div><time className="shrink-0 text-xs text-[#7a857c]">{new Date(item.at).toLocaleString()}</time></div>)}</div> : <p className="mt-4 text-sm text-[#66716a]">{t("No recent activity in this data view.")}</p>}</section>
          </section>
        )}
        {tab === "review-queue" && (
          <section>
            <SectionHeading title={t("Review queue")} description={t("Safety cases first, then overdue and routine reviews. Every priority shows its reason.")} count={reviewQueue?.summary.open} />
            {reviewQueue && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
              ["Open", reviewQueue.summary.open], ["Urgent", reviewQueue.summary.urgent],
              ["Overdue", reviewQueue.summary.overdue], ["Unassigned", reviewQueue.summary.unassigned],
            ] as const).map(([label, value]) => <div key={label} className={`${panel} p-4`}><p className="text-sm text-[#66716a]">{t(String(label))}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>}
            {!reviewQueue ? <div className={`${panel} p-5 text-sm text-[#66716a]`}>{t("Loading reviews…")}</div> : reviewQueue.items.length === 0 ? <EmptyPanel title={t("Queue is clear")} detail={t("New proofs, listings, kitchens, and hygiene reports will appear here.")} /> : <div className="space-y-3">{reviewQueue.items.map((item) => <article key={`${item.type}-${item.id}`} className={`${panel} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><StatusPill label={item.priority} tone={item.priority === "urgent" ? "danger" : item.priority === "high" ? "warning" : "neutral"} /><span className="text-xs font-semibold uppercase tracking-wide text-[#66716a]">{t(item.type)}</span><span className="text-xs text-[#66716a]">{t(item.seller_tier)} {t("seller")}</span></div><h3 className="mt-2 font-semibold">{item.title}</h3><p className="mt-1 text-sm text-[#66716a]">{item.kitchen_name} {t("· waiting")} {item.waiting_hours.toFixed(1)} {t("hours")}{item.overdue ? " · " + t("Overdue") : ""}</p></div><button type="button" onClick={() => { if (item.type === "kitchen") { setTab("kitchens"); void showKitchen(item.id); } else setTab(item.type === "listing" ? "listings" : item.type === "proof" ? "proofs" : "hygiene"); }} className={quietButton}>{t("Open review")}</button></div>
              <p className="mt-3 text-sm text-[#536158]">{item.reasons.map((reason) => t(reason)).join(" · ")}</p>
              {item.application && <div className="mt-3 rounded-lg bg-[#f5f8f3] p-3 text-sm"><p className="font-semibold">{t("Seller application")} · {item.application.ready ? t("Ready for final review") : t("Waiting for requirements")}</p><div className="mt-2 flex flex-wrap gap-2">{[["Email verified", item.application.requirements.email_verified], ["Location set", item.application.requirements.location_set], ...item.application.lessons.map((lesson) => [lesson.title, lesson.completed] as const)].map(([label, done]) => <span key={label} className={`rounded-full px-2.5 py-1 text-xs ${done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{done ? "✓" : "○"} {t(label)}</span>)}</div><p className="mt-2 text-xs text-[#66716a]">{t("Open the application to review each lesson and its latest proof.")}</p></div>}
              <label className="mt-4 block max-w-xs text-xs font-semibold text-[#536158]">{t("Assigned reviewer")}<select value={item.reviewer_id ?? ""} onChange={async (event) => { try { await api.patch(`/admin/review-queue/${item.type}/${item.id}/assignment`, { reviewer_id: event.target.value || null }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not assign review"); } }} className={inputClass}><option value="">{t("Unassigned")}</option>{admins.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            </article>)}</div>}
          </section>
        )}
        {tab === "kitchens" && (
          <section aria-label={t("Kitchen review workspace")}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold">{t("Kitchen reviews")}</h2><p className="mt-1 text-sm text-[#66716a]">{t("Select a kitchen to inspect its training and submitted evidence.")}</p></div>
              <p className="text-sm tabular-nums text-[#536158]">{demoScope ? `${kitchens.filter((k) => k.is_demo).length} demo kitchens` : `${kitchens.filter((k) => k.status === "pending").length} awaiting a kitchen decision`}</p>
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[310px_minmax(0,1fr)] xl:items-start">
              <div className="min-w-0 rounded-xl border border-[#e0e5df] bg-white p-3 shadow-sm">
                {demoScope ? <p className="rounded-lg bg-[#f4f7ef] px-3 py-2 text-xs font-semibold text-[#526c55]">{t("Sample kitchens for presentation")}</p> : <div className="flex gap-1 rounded-lg bg-[#f2f4f0] p-1" aria-label={t("Kitchen filters")}>{([ ["real", "All real"], ["pending", "Pending"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setKitchenFilter(value)} aria-pressed={kitchenFilter === value} className={"flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors " + (kitchenFilter === value ? "bg-white text-[#244c35] shadow-sm" : "text-[#657168] hover:text-[#26372a]")}>{t(label)}</button>)}</div>}
                <label className="mt-3 block text-xs font-semibold text-[#59665c]">{t("Find a kitchen")}
                  <input type="search" value={kitchenSearch} onChange={(event) => setKitchenSearch(event.target.value)} placeholder={t("Name, chef, or area")} className="mt-1.5 w-full rounded-lg border border-[#dce3dc] bg-white px-3 py-2.5 text-sm text-[#253329] outline-none placeholder:text-[#89958a] focus-visible:border-[#38674a] focus-visible:ring-2 focus-visible:ring-[#38674a]/20" />
                </label>
                <div className="mt-3 max-h-[calc(100dvh-290px)] min-h-40 space-y-1 overflow-y-auto" aria-label={t("Kitchen list")}>
                  {visibleKitchens.length === 0 && <p className="px-2 py-5 text-sm text-[#66716a]">{t("No kitchens match this view.")}</p>}
                  {visibleKitchens.map((kitchen) => <button key={kitchen.id} type="button" onClick={() => void showKitchen(kitchen.id)} aria-pressed={selectedKitchen === kitchen.id}
                    className={"group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38674a] " + (selectedKitchen === kitchen.id ? "bg-[#e5eee5]" : "hover:bg-[#f5f7f3]")}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#26352a]">{kitchen.name}</span><span className="mt-0.5 block truncate text-xs text-[#67736b]">{kitchen.area} · {kitchen.chef}</span><span className="mt-1 block text-[11px] font-medium text-[#56665a]">{kitchen.status === "sample" ? t("Sample profile") : kitchen.status === "pending" ? t("Kitchen decision needed") : kitchen.status === "active" ? t("Active kitchen") : t(kitchen.status)}</span></span>
                    <ChevronRight size={16} className="shrink-0 text-[#88968a]" aria-hidden="true" />
                  </button>)}
                </div>
              </div>
              <div className="min-w-0" aria-label={t("Kitchen review")}>
                {!selectedKitchen && <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cdd9ce] bg-white/70 px-6 text-center"><Store size={34} strokeWidth={1.3} className="text-[#65816b]" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">{t("Choose a kitchen to review")}</h3><p className="mt-1 max-w-sm text-sm text-[#66716a]">{t("Training scores, uploaded photos, and the kitchen decision will appear here.")}</p></div>}
                {selectedKitchen && !review && <div className="min-h-[480px] animate-pulse rounded-xl border border-[#e0e5df] bg-white p-6"><div className="h-7 w-1/2 rounded bg-[#e7ece5]" /><div className="mt-5 h-20 rounded bg-[#eff2ed]" /><div className="mt-7 h-60 rounded bg-[#eff2ed]" /></div>}
                {review && selectedKitchen === review.kitchen.id && <div className="overflow-hidden rounded-xl border border-[#dce4db] bg-white shadow-sm">
                  <div className="border-b border-[#e7ebe6] px-5 py-5 sm:px-7">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold tracking-tight">{review.kitchen.name}</h3><p className="mt-1 text-sm text-[#66716a]">{review.kitchen.chef} · {review.kitchen.area}</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold capitalize " + (review.kitchen.status === "active" ? "bg-[#e4f0e6] text-[#2c6040]" : review.kitchen.status === "pending" ? "bg-[#fff0d8] text-[#8a5d1b]" : "bg-[#eef0ed] text-[#5f6961]")}>{review.kitchen.status === "sample" ? t("Sample profile") : t(review.kitchen.status)}</span></div>
                    {review.kitchen.bio && <p className="mt-3 max-w-2xl text-sm text-[#536158]">{review.kitchen.bio}</p>}
                    <dl className="mt-5 grid gap-4 border-t border-[#edf0eb] pt-4 text-sm sm:grid-cols-3">
                      <div><dt className="text-xs font-medium text-[#69766c]">{t("Seller")}</dt><dd className="mt-1 font-semibold">{review.seller?.name || "Unknown"}</dd><dd className="break-all text-xs text-[#66716a]">{review.seller?.email}</dd></div>
                      <div><dt className="text-xs font-medium text-[#69766c]">{t("Account and location")}</dt><dd className="mt-1">{review.seller?.email_verified ? t("Email verified") : t("Email not verified")}</dd><dd className="text-xs text-[#66716a]">{review.kitchen.location_set ? t("Location set") : t("Location missing")}</dd></div>
                      <div><dt className="text-xs font-medium text-[#69766c]">{t("Training")}</dt><dd className="mt-1 font-semibold tabular-nums">{review.modules.filter((module) => module.progress.completed).length} / {review.modules.length} {t("approved")}</dd><dd className="text-xs text-[#66716a]">{review.modules.filter((module) => module.progress.proof_status === "pending").length} {t("proofs waiting")}</dd></div>
                    </dl>
                    {review.kitchen.retraining_at && <p className="mt-4 rounded-lg bg-[#fff5e5] px-3 py-2 text-sm text-[#765821]">{t("Retraining required since")} {new Date(review.kitchen.retraining_at).toLocaleString()}{t(". Earlier attempts do not count.")}</p>}
                  </div>
                  <div className="px-5 py-5 sm:px-7"><h4 className="text-base font-semibold">{t("Training progress")}</h4><p className="mt-1 text-sm text-[#66716a]">{t("Review quiz results and submitted proof. Allergens is completed by seller confirmation.")}</p>
                    <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                      <div className="space-y-1" aria-label={t("Training lessons")}>{review.modules.map((module) => <button type="button" key={module.id} onClick={() => setSelectedModule(module.id)} aria-pressed={selectedModule === module.id} className={"flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-start text-sm focus-visible:outline-2 focus-visible:outline-[#38674a] " + (selectedModule === module.id ? "bg-[#e6eee5] text-[#214d32]" : "hover:bg-[#f4f6f2]")}><span className="font-medium">{t(module.title)}</span><span className={"h-2 w-2 shrink-0 rounded-full " + (module.progress.completed ? "bg-[#398258]" : module.progress.proof_status === "pending" ? "bg-[#d29438]" : "bg-[#aeb9ae]")} aria-label={module.progress.completed ? t("Approved") : t(module.progress.proof_status)} /></button>)}</div>
                      <div className="min-w-0 rounded-lg border border-[#e5eae3] bg-[#fbfcfa] p-4 sm:p-5">{review.modules.filter((module) => module.id === selectedModule).map((module) => <div key={module.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="text-base font-semibold">{module.title}</h5><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-[#526358] ring-1 ring-[#e0e7df]">{module.progress.completed ? t("Complete") : module.id === "allergens" ? module.progress.quiz_passed ? t("Awaiting confirmation") : t("Quiz needed") : t(module.progress.proof_status.replaceAll("_", " "))}</span></div>
                        <p className="mt-2 text-sm text-[#5b685e]">{module.id === "allergens" ? t("Seller confirmation") : t("Expected proof")}: {t(module.proof_instruction)}</p>
                        <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-[#e6ebe5]"><span className="text-xs font-medium text-[#657168]">{t("Latest quiz result")}</span><p className="mt-1 font-semibold tabular-nums">{module.quiz_attempts.length ? `${module.quiz_attempts[0].score} / ${module.question_count} correct · ${module.quiz_attempts[0].passed ? "Passed" : "Not passed"}` : t("No attempt yet")}</p>{module.quiz_attempts.length > 1 && <details className="mt-2 text-xs text-[#657168]"><summary className="cursor-pointer">{module.quiz_attempts.length} {t("attempts")}</summary>{module.quiz_attempts.map((attempt) => <p key={attempt.id} className="mt-1">{attempt.score}/{module.question_count} · {attempt.passed ? t("Passed") : t("Not passed")} · {new Date(attempt.submitted_at).toLocaleString()}</p>)}</details>}</div>
                        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-[#315b3e]">{t("See quiz questions and correct answers")}</summary><ol className="mt-2 list-decimal space-y-2 ps-5 text-[#4d5b50]">{module.questions.map((q) => <li key={q.question}>{q.question}<span className="block text-xs text-[#617267]">{t("Correct:")} {t(q.correct_answer)}</span></li>)}</ol><p className="mt-2 text-xs text-[#7b877c]">{t("Past selected answers were not stored.")}</p></details>
                        {module.id === "allergens" ? <div className="mt-5 rounded-lg border border-[#dce4db] bg-white px-4 py-4 text-sm text-[#526358]">{module.progress.acknowledged ? t("Seller confirmed understanding after passing the quiz.") : module.progress.completed ? t("Completed with previously approved proof.") : t("Waiting for the seller to pass the quiz and confirm understanding.")}</div> : module.proofs.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-[#dce4db] px-4 py-7 text-center text-sm text-[#6e7b70]">{t("No evidence submitted for this lesson.")}</div> : <div className="mt-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold">{t("Latest evidence")}</p><p className="text-xs text-[#6b776d]">{new Date(module.proofs[0].submitted_at).toLocaleString()}</p></div>{module.proofs[0].camera_check && <p className="mt-2 text-xs text-[#56665b]">{t("Model detected:")} {module.proofs[0].camera_check.detections.map((d) => `${t(d.label)} ${Math.round(d.confidence * 100)}%`).join(" · ") || "Nothing"}{t(". Check the actual image before approval.")}</p>}<ProofPreview proof={module.proofs[0]} />{module.proofs[0].reason && <p className="mt-2 text-sm text-[#a23c35]">{t("Previous decision:")} {module.proofs[0].reason}</p>}{module.proofs[0].status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/training/proofs/${module.proofs[0].id}/decision`, { decision: "approve" })} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm font-semibold text-white hover:bg-[#254d35]">{t("Approve proof")}</button><button onClick={() => reject(`/admin/training/proofs/${module.proofs[0].id}/decision`)} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm font-medium text-[#9c403b] hover:bg-[#fff3f0]">{t("Reject proof")}</button></div>}{module.proofs.length > 1 && <details className="mt-4 text-xs text-[#657168]"><summary className="cursor-pointer">{module.proofs.length - 1} {t("earlier submissions")}</summary>{module.proofs.slice(1).map((proof) => <div key={proof.id} className="mt-3 border-t border-[#e5eae3] pt-3"><p className="font-semibold capitalize">{t(proof.status)} · {new Date(proof.submitted_at).toLocaleString()}</p>{proof.reason && <p>{t("Reason:")} {proof.reason}</p>}<ProofPreview proof={proof} /></div>)}</details>}</div>}
                      </div>)}</div>
                    </div>
                  </div>
                  {review.kitchen.status !== "sample" && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ebe6] bg-[#f5f8f3] px-5 py-4 sm:px-7"><div><p className="text-sm font-semibold">{t("Kitchen decision")}</p><p className="mt-0.5 text-xs text-[#68776b]">{t("Listings go public only after kitchen and training approval.")}</p></div><div className="flex flex-wrap gap-2">{review.kitchen.status === "pending" && <><button disabled={!review.seller?.email_verified || !review.kitchen.location_set || !review.modules.length || review.modules.some((module) => !module.progress.completed)} onClick={() => void action(`/admin/kitchens/${review.kitchen.id}/decision`, { decision: "approve" })} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm font-semibold text-white hover:bg-[#254d35] disabled:cursor-not-allowed disabled:opacity-40">{t("Approve kitchen")}</button><button onClick={() => reject(`/admin/kitchens/${review.kitchen.id}/decision`)} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm font-medium text-[#9c403b] hover:bg-[#fff3f0]">{t("Reject kitchen")}</button></>}{review.kitchen.status === "active" && <><button onClick={() => { const reason = window.prompt(t("Reason for suspension")); if (reason?.trim()) void action(`/admin/vendors/${review.kitchen.id}/suspension`, { reason }); }} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm text-[#9c403b]">{t("Suspend")}</button><button onClick={() => void action(`/admin/vendors/${review.kitchen.id}/retraining`, {})} className="rounded-lg border border-[#cdd9ce] px-4 py-2 text-sm text-[#315e42]">{t("Require retraining")}</button></>}{review.kitchen.status === "suspended" && <button onClick={async () => { await api.delete(`/admin/vendors/${review.kitchen.id}/suspension`); await load(); await showKitchen(review.kitchen.id); }} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm text-white">{t("Reinstate")}</button>}</div></div>}
                </div>}
              </div>
            </div>
          </section>
        )}
        {tab === "listings" && (
          <section><SectionHeading title={t("Listings awaiting review")} description={t("Check the dish, price, portion, and photo before publishing.")} count={visibleListings.length} />
            {visibleListings.length === 0 ? <EmptyPanel title={t("No listings to review")} detail={t("New seller dishes will appear here with their photo and details.")} /> : <div className="space-y-4">{visibleListings.map((item) => <article key={item.id} className={`${panel} overflow-hidden sm:flex`}><div className="h-48 bg-[#f1f3ee] sm:h-auto sm:w-56 sm:shrink-0">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-[#748075]">{t("No dish photo")}</div>}</div><div className="min-w-0 flex-1 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-semibold">{item.name}</h3><p className="mt-0.5 text-sm text-[#66716a]">{item.vendor_name} · {item.area}</p></div><StatusPill label={t("Pending review")} tone="warning" /></div><p className="mt-3 max-w-2xl text-sm text-[#536158]">{item.description || "No description provided."}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#ebefea] pt-3 text-sm"><span><strong>{t("Rs")} {item.price_pkr.toLocaleString()}</strong></span><span className="text-[#66716a]">{t("Portion:")} {item.portion_size}</span><span className="text-[#66716a]">{t("Available:")} {item.portions_available}</span></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/listings/${item.id}/decision`, { decision: "approve" })} className={primaryButton}>{t("Approve listing")}</button><button onClick={() => reject(`/admin/listings/${item.id}/decision`)} className={dangerButton}>{t("Reject listing")}</button></div></div></article>)}</div>}
          </section>
        )}
        {tab === "buyers" && (
          <section><SectionHeading title={t("Registered users")} description={t("Real accounts and sample profiles are shown separately.")} count={buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).length} />
            {buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).length === 0 ? <EmptyPanel title={t("No users in this view")} detail={t("New accounts will appear here after registration.")} /> : <div className={`${panel} overflow-hidden`}><div className="hidden grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1fr)_90px] gap-4 border-b border-[#e7ece6] bg-[#f7f9f5] px-5 py-3 text-xs font-semibold text-[#627167] md:grid"><span>{t("Account")}</span><span>{t("Role")}</span><span>{t("Email")}</span><span>{t("Orders")}</span></div>{buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).map((buyer) => <div key={buyer.id} className="grid gap-2 border-b border-[#edf0eb] px-5 py-4 text-sm last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1fr)_90px] md:items-center md:gap-4"><div><p className="font-semibold">{buyer.name}</p><p className="text-xs text-[#66716a] md:hidden">{buyer.email}</p></div><div><StatusPill label={buyer.role} /></div><div className="hidden min-w-0 md:block"><p className="truncate text-[#536158]">{buyer.email}</p><p className="text-xs text-[#758177]">{buyer.is_sample ? t("Preview account") : buyer.email_verified ? t("Email verified") : t("Email not verified")}</p></div><span className="tabular-nums text-[#536158]">{buyer.orders}<span className="md:hidden"> {t("orders")}</span></span></div>)}</div>}
          </section>
        )}
        {tab === "proofs" && (
          <section><SectionHeading title={t("Training proof queue")} description={t("Open the actual image or video and compare it with the requested lesson evidence.")} count={visibleProofs.length} />
            {visibleProofs.length === 0 ? <EmptyPanel title={t("Proof queue is clear")} detail={t("New submissions from sellers will appear here for your review.")} /> : <div className="grid gap-4 lg:grid-cols-2">{visibleProofs.map((proof) => <article key={proof.id} className={`${panel} min-w-0 overflow-hidden`}><div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8ece7] px-5 py-4"><div><h3 className="font-semibold capitalize">{t(proof.module_id.replaceAll("-", " "))}</h3><p className="mt-0.5 text-xs text-[#66716a]">{proof.kitchen_name || proof.seller_name || "Seller"} · {new Date(proof.submitted_at).toLocaleString()}</p></div><StatusPill label={t("Pending")} tone="warning" /></div><div className="p-5">{proof.camera_check && <p className="mb-3 rounded-lg bg-[#f1f5ee] px-3 py-2 text-xs text-[#52645a]">{t("Camera model detected")} {proof.camera_check.detections.map((d) => `${t(d.label)} ${Math.round(d.confidence * 100)}%`).join(" · ") || "no matching objects"}{t(". Inspect the frame yourself.")}</p>}<ProofPreview proof={proof} /><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/training/proofs/${proof.id}/decision`, { decision: "approve" })} className={primaryButton}>{t("Approve proof")}</button><button onClick={() => reject(`/admin/training/proofs/${proof.id}/decision`)} className={dangerButton}>{t("Reject proof")}</button></div></div></article>)}</div>}
          </section>
        )}
        {tab === "hygiene" && (
          <section><SectionHeading title={t("Hygiene reports")} description={t("Review buyer reports and record a reason for every resolution.")} count={visibleFlags.length} />
            {watchlist.length > 0 && <div className="mb-5 rounded-xl border border-[#e8d6b5] bg-[#fff8ea] p-5"><h3 className="font-semibold text-[#765821]">{t("Watchlist")}</h3><p className="mt-1 text-sm text-[#816d4b]">{t("Kitchens with repeated open reports.")}</p><div className="mt-3 flex flex-wrap gap-2">{watchlist.map((item) => <span key={item.vendor_id} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#765821]">{item.name} · {item.open_flags} {t("reports")}</span>)}</div></div>}
            {visibleFlags.length === 0 ? <EmptyPanel title={t("No open hygiene reports")} detail={t("Buyer reports will appear here with their kitchen and order reference.")} /> : <div className="space-y-3">{visibleFlags.map((flag) => <article key={flag.id} className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{kitchens.find((k) => k.id === flag.vendor_id)?.name || `Kitchen ${flag.vendor_id.slice(0,8)}`}</h3><p className="mt-1 text-xs text-[#66716a]">{t("Order #")}{flag.order_id.slice(0,8)} · {new Date(flag.created_at).toLocaleString()}</p></div><StatusPill label={t("Open")} tone="warning" /></div><p className="mt-4 max-w-3xl text-sm text-[#3f4b42]">{flag.description}</p><div className="mt-4 flex flex-wrap gap-2 border-t border-[#e9ede7] pt-4">{(["resolved", "dismissed"] as const).map((status) => <button key={status} onClick={() => { const reason = window.prompt(t("Reason for marking this report {status}", { status: t(status) })); if (reason?.trim()) void action(`/admin/hygiene/flags/${flag.id}`, { status, reason: reason.trim() }, "patch"); }} className={status === "resolved" ? primaryButton : quietButton}>{status === "resolved" ? t("Resolve report") : t("Dismiss report")}</button>)}</div></article>)}</div>}
          </section>
        )}
        {tab === "orders" && (
          <section><SectionHeading title={t("Orders")} description={t("Track handover and confirm cash only after it is received.")} count={visibleOrders.length} />
            {visibleOrders.length === 0 ? <EmptyPanel title={t("No orders yet")} detail={t("Placed orders and their fulfilment status will appear here.")} /> : <div className="space-y-3">{visibleOrders.map((order) => <article key={order.id} className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{t("Order #")}{order.id.slice(0,8)}</h3><p className="mt-1 text-xs text-[#66716a]">{t("Placed")} {new Date(order.placed_at).toLocaleString()} · {order.vendor_name} · {order.buyer_name}</p></div><strong className="text-lg tabular-nums">{t("Rs")} {order.total_pkr.toLocaleString()}</strong></div><div className="mt-4 flex flex-wrap gap-2"><StatusPill label={order.status} tone={order.status === "delivered" ? "success" : order.status === "cancelled" ? "danger" : "warning"} /><StatusPill label={order.payment_status === "paid" ? t("Cash received") : t("Cash outstanding")} tone={order.payment_status === "paid" ? "success" : "neutral"} /></div><div className="mt-4 flex flex-wrap gap-2 border-t border-[#e9ede7] pt-4">{order.status === "ready" && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "out_for_delivery" }, "patch")} className={primaryButton}>{t("Mark out for delivery")}</button>}{order.status === "out_for_delivery" && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "delivered" }, "patch")} className={primaryButton}>{t("Mark delivered")}</button>}{order.status === "delivered" && order.payment_status === "unpaid" && <button onClick={() => void action(`/admin/orders/${order.id}/cash-received`, { amount_pkr: order.total_pkr })} className={primaryButton}>{t("Confirm cash received")}</button>}{!["delivered", "cancelled", "rejected"].includes(order.status) && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "cancelled" }, "patch")} className={dangerButton}>{t("Cancel order")}</button>}</div></article>)}</div>}
          </section>
        )}
        {tab === "analytics" && (
          <section><SectionHeading title={t("Platform analytics")} description={t("Paid revenue, demand, and training in the selected data view.")} />
            <div className="mb-5 inline-flex rounded-full border border-[#dfe6de] bg-white p-1" aria-label={t("Analytics date range")}>{([ ["today", "Today"], ["week", "This week"], ["month", "This month"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={analyticsRange === value} onClick={() => setAnalyticsRange(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${analyticsRange === value ? "bg-[#a82d13] text-white" : "text-[#59655c] hover:bg-[#f2f5f0]"}`}>{t(label)}</button>)}</div>
            {!analytics ? <div className={`${panel} animate-pulse p-6`}><div className="h-7 w-1/3 rounded bg-[#e8eee6]" /><div className="mt-5 h-48 rounded bg-[#f1f4ef]" /></div> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Paid revenue", `Rs ${analytics.revenue.total_pkr.toLocaleString()}`], ["Seller kitchens", analytics.training.seller_count], ["Training verified", analytics.training.verified_count], ["Pending proofs", analytics.training.pending_proofs]].map(([label,value]) => <div key={label} className={`${panel} p-5`}><p className="text-sm text-[#66716a]">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2">{[["Top kitchens", analytics.leaderboard.vendors.map((item) => ({name:item.name, detail:`Rs ${item.revenue_pkr.toLocaleString()} · ${item.orders} ${item.orders === 1 ? "order" : "orders"}`}))], ["Most ordered dishes", analytics.leaderboard.dishes.map((item) => ({name:item.name, detail:`${item.portions_sold} ${item.portions_sold === 1 ? "portion" : "portions"}`}))], ["Demand by area", analytics.demand.areas.map((item) => ({name:item.area, detail:`${item.orders} ${item.orders === 1 ? "order" : "orders"}`}))], ["Revenue by area", analytics.revenue.areas.map((item) => ({name:item.area, detail:`Rs ${item.revenue_pkr.toLocaleString()}`}))]].map(([title,rows]) => <div key={title as string} className={`${panel} p-5`}><h3 className="font-semibold">{title as string}</h3>{(rows as {name:string;detail:string}[]).length === 0 ? <p className="mt-4 text-sm text-[#66716a]">{t("No completed activity in this period.")}</p> : <div className="mt-4 divide-y divide-[#e9ede7]">{(rows as {name:string;detail:string}[]).map((row) => <div key={row.name} className="flex justify-between gap-3 py-3 text-sm"><span className="font-medium">{row.name}</span><span className="text-end tabular-nums text-[#66716a]">{row.detail}</span></div>)}</div>}</div>)}</div></>}
            {analytics && <AdminAnalyticsCharts analytics={analytics} />}
          </section>
        )}
        {tab === "analytics" && analytics && <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className={`${panel} p-5`}><h3 className="font-semibold">{t("Demand versus available kitchens")}</h3><p className="mt-1 text-xs text-[#66716a]">{demoScope ? t("Fictional demand and verified preview kitchens by area. Preview menus cannot be ordered.") : t("Last 30 days. Demand uses buyer delivery area; supply uses active verified kitchens with an available approved dish.")}</p>{analytics.health.areas.length === 0 ? <p className="mt-4 text-sm text-[#66716a]">{t("No matching activity yet.")}</p> : <div className="mt-4 divide-y divide-[#e9ede7]">{analytics.health.areas.slice(0, 12).map((area) => <div key={area.area} className="flex justify-between gap-3 py-2 text-sm"><span className="capitalize">{area.area}</span><span className="text-end tabular-nums">{area.delivered_orders_to_area} {t("orders ·")} {area.available_verified_kitchens_in_area} {t("kitchens")}{area.orders_per_available_kitchen !== null ? ` · ${area.orders_per_available_kitchen}/kitchen` : ""}</span></div>)}</div>}</section>
          <section className={`${panel} p-5`}><h3 className="font-semibold">{t("Seller order trends")}</h3><p className="mt-1 text-xs text-[#66716a]">{t("Delivered orders in the latest 30 days versus the prior 30 days. Classification needs at least ten orders.")}</p>{analytics.health.seller_trajectories.length === 0 ? <p className="mt-4 text-sm text-[#66716a]">{t("No sellers in this view.")}</p> : <div className="mt-4 divide-y divide-[#e9ede7]">{analytics.health.seller_trajectories.slice(0, 12).map((seller) => <div key={seller.kitchen_id} className="flex justify-between gap-3 py-2 text-sm"><span>{seller.name}</span><span className="text-end">{seller.previous_30_days} → {seller.recent_30_days} · {seller.trajectory}</span></div>)}</div>}</section>
          <section className={`${panel} p-5 lg:col-span-2`}><h3 className="font-semibold">{t("ChefCam proposed rule audit")}</h3><p className="mt-1 text-xs text-[#66716a]">{t("Shadow mode:")} {analytics.chefcam.rule}{t(". The model does not approve proofs.")}</p><div className="mt-4 grid gap-3 sm:grid-cols-4">{[["Proofs with model results", analytics.chefcam.proofs_with_model_evidence], ["Would approve", analytics.chefcam.would_approve], ["Reviewed suggestions", analytics.chefcam.would_approve_reviewed], ["Human rejections", analytics.chefcam.human_rejections_among_would_approve]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f4f7f2] p-3"><p className="text-xl font-semibold">{value}</p><p className="text-xs text-[#66716a]">{label}</p></div>)}</div><p className="mt-3 text-xs text-[#66716a]">{analytics.chefcam.note}</p></section>
        </div>}
        {tab === "analytics" && <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {reviewOperations && <section className={`${panel} p-5`}><h3 className="font-semibold">{t("Review workload")}</h3><p className="mt-1 text-xs text-[#66716a]">{t("Completed decisions and average wait in the last 30 days.")}</p><div className="mt-4 divide-y divide-[#e9ede7]">{reviewOperations.by_type.map((row) => <div key={row.type} className="flex justify-between gap-3 py-2 text-sm"><span className="capitalize">{t(row.type.replaceAll("_", " "))}</span><span>{row.completed_reviews} {t("decisions ·")} {row.average_wait_hours === null ? t("No wait data") : t("{hours}h average", { hours: row.average_wait_hours })}</span></div>)}</div></section>}
          {cohorts && <section className={`${panel} p-5`}><h3 className="font-semibold">{t("Buyer cohort activity")}</h3><p className="mt-1 text-xs text-[#66716a]">{cohorts.definition}</p>{cohorts.cohorts.length === 0 ? <p className="mt-4 text-sm text-[#66716a]">{t("No recent signup cohorts.")}</p> : <div className="mt-4 space-y-3">{cohorts.cohorts.map((cohort) => <div key={cohort.signup_month} className="border-b border-[#e9ede7] pb-2 text-sm"><strong>{cohort.signup_month} · {cohort.buyers} {t("accounts")}</strong><p className="mt-1 text-xs text-[#66716a]">{cohort.weeks.map((week) => `W${week.week}: ${week.rate === null ? "—" : `${Math.round(week.rate * 100)}%`} (${week.eligible_buyers} eligible)`).join(" · ")}</p></div>)}</div>}</section>}
          {verificationOutcomes && <section className={`${panel} p-5 lg:col-span-2`}><h3 className="font-semibold">{t("Verification outcome monitor")}</h3><p className="mt-1 text-xs text-[#66716a]">{t(verificationOutcomes.note)}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{verificationOutcomes.groups.map((group) => <div key={group.group} className="rounded-lg bg-[#f4f7f2] p-4"><p className="font-semibold capitalize">{t(group.group.replaceAll("_", " "))}</p><p className="mt-1 text-sm">{group.kitchens} {t("kitchens ·")} {group.delivered_orders} {t("delivered orders ·")} {group.buyer_reports} {t("reports")}</p><p className="mt-1 text-sm font-semibold">{group.reports_per_100_delivered_orders === null ? t("No report rate yet") : t("{count} reports per 100 delivered orders", { count: group.reports_per_100_delivered_orders })}</p></div>)}</div></section>}
        </div>}
        {tab === "settings" && settings && (
          <section><SectionHeading title={t("Platform settings")} description={t("Rules used by reports and review timing. Changes apply to the live platform.")} />
            <form onSubmit={(event) => { event.preventDefault(); void action("/admin/settings", settings, "patch"); }} className={`${panel} max-w-2xl overflow-hidden`}><div className="space-y-6 p-5 sm:p-7"><div><h3 className="font-semibold">{t("Review operations")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("Set when reviews become overdue and when a seller enters the hygiene watchlist.")}</p></div><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">{t("Review target")} <span className="block text-xs font-normal text-[#66716a]">{t("Hours before a pending review is overdue")}</span><input type="number" min="1" max="168" value={settings.review_sla_hours} onChange={(event) => setSettings({ ...settings, review_sla_hours: Number(event.target.value) })} className={inputClass} /></label><label className="block text-sm font-medium">{t("Watchlist threshold")} <span className="block text-xs font-normal text-[#66716a]">{t("Open hygiene reports needed to flag a kitchen")}</span><input type="number" min="1" max="20" value={settings.hygiene_flag_threshold} onChange={(event) => setSettings({ ...settings, hygiene_flag_threshold: Number(event.target.value) })} className={inputClass} /></label></div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e3e9e1] bg-[#f8faf7] p-4"><input type="checkbox" checked={settings.notifications_enabled} onChange={(event) => setSettings({ ...settings, notifications_enabled: event.target.checked })} className="mt-1 accent-[#315e42]" /><span><strong className="block text-sm">{t("Admin notifications")}</strong><span className="mt-0.5 block text-xs text-[#66716a]">{t("Send operational notifications when enabled.")}</span></span></label></div><div className="flex justify-end border-t border-[#e7ece6] bg-[#f7f9f5] px-5 py-4 sm:px-7"><button className={primaryButton}>{t("Save settings")}</button></div></form>
          </section>
        )}
        {tab === "team" && (
          <section><SectionHeading title={t("Admin team")} description={t("Invite another administrator and manage existing access.")} count={admins.length} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"><form onSubmit={async (event) => { event.preventDefault(); try { await api.post("/admin/users/invitations", { email: inviteEmail }); setInviteEmail(""); setMessage("Invitation sent by Brevo."); } catch (err) { setError(err instanceof Error ? err.message : "Could not send invitation"); } }} className={`${panel} h-fit p-5 sm:p-6`}><h3 className="font-semibold">{t("Invite an admin")}</h3><p className="mt-1 text-sm text-[#66716a]">{t("A code will be emailed to the address below.")}</p><label className="mt-5 block text-sm font-medium">{t("Email address")}<input type="email" required placeholder="name@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className={inputClass} /></label><button className={`mt-4 ${primaryButton}`}>{t("Send invitation")}</button></form><div className={`${panel} overflow-hidden`}><div className="border-b border-[#e7ece6] px-5 py-4"><h3 className="font-semibold">{t("Current administrators")}</h3></div>{admins.length === 0 ? <p className="p-5 text-sm text-[#66716a]">{t("No admin accounts returned.")}</p> : <div className="divide-y divide-[#e9ede7]">{admins.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{member.name}{member.id === user.id && <span className="ms-2 text-xs font-normal text-[#66716a]">{t("You")}</span>}</p><p className="mt-0.5 text-xs text-[#66716a]">{member.email}</p></div>{member.id !== user.id && <button onClick={async () => { try { await api.delete(`/admin/users/${member.id}`); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not remove admin"); } }} className={dangerButton}>{t("Remove access")}</button>}</div>)}</div>}</div></div>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
