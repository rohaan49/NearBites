import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE, api, readSession } from "@/lib/api";
import { BarChart3, BookOpenCheck, ChevronRight, ClipboardList, LayoutDashboard, Settings2, ShieldAlert, ShoppingBag, Store, Users, UtensilsCrossed } from "lucide-react";

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
type Overview = { delivered_orders: number; revenue_pkr: number; active_vendors: number; pending_listings: number; pending_proofs: number; open_hygiene_reports: number; overdue_reviews: number; daily: { day: string; orders: number; revenue_pkr: number }[] };
type Analytics = { leaderboard: { vendors: { vendor_id: string; name: string; revenue_pkr: number; orders: number }[]; dishes: { dish_id: string; name: string; portions_sold: number }[] }; demand: { areas: { area: string; orders: number }[] }; revenue: { total_pkr: number; areas: { area: string; revenue_pkr: number }[] }; training: { seller_count: number; verified_count: number; pending_proofs: number } };
type Settings = { hygiene_flag_threshold: number; review_sla_hours: number; notifications_enabled: boolean };

const panel = "rounded-xl border border-[#dfe6de] bg-white shadow-sm";
const primaryButton = "rounded-lg bg-[#315e42] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#254d35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42] disabled:opacity-50";
const quietButton = "rounded-lg border border-[#d4ded4] px-4 py-2.5 text-sm font-semibold text-[#315e42] transition-colors hover:bg-[#eef4ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42]";
const dangerButton = "rounded-lg border border-[#dfc4bf] px-4 py-2.5 text-sm font-semibold text-[#9c403b] transition-colors hover:bg-[#fff3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9c403b]";
const inputClass = "mt-1.5 w-full rounded-lg border border-[#dce3dc] bg-white px-3 py-2.5 text-sm outline-none focus-visible:border-[#38674a] focus-visible:ring-2 focus-visible:ring-[#38674a]/20";

function SectionHeading({ title, description, count }: { title: string; description: string; count?: number }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-[#66716a]">{description}</p></div>{count !== undefined && <span className="text-sm tabular-nums text-[#536158]">{count} {count === 1 ? "item" : "items"}</span>}</div>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className={`${panel} px-6 py-14 text-center`}><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-[#66716a]">{detail}</p></div>;
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const tones = { neutral: "bg-[#eef1ed] text-[#526056]", success: "bg-[#e4f0e6] text-[#2c6040]", warning: "bg-[#fff0d8] text-[#8a5d1b]", danger: "bg-[#fff0ec] text-[#a4473e]" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones[tone]}`}>{label.replaceAll("_", " ")}</span>;
}

function ProofPreview({ proof }: { proof: Proof }) {
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

  if (error) return <p className="mt-2 text-sm text-destructive">{error}</p>;
  if (!url) return <p className="mt-2 text-sm text-muted-foreground">Loading evidence…</p>;
  return <div className="mt-2">
    {proof.content_type?.startsWith("video/") ? <video src={url} controls className="max-h-80 w-full max-w-xl rounded-xl bg-black" /> : <img src={url} alt={`${proof.module_id} evidence uploaded by seller`} className="max-h-96 w-full max-w-xl rounded-xl border border-border object-contain" />}
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary underline">Open full evidence</a>
  </div>;
}

const tabs = ["overview", "kitchens", "buyers", "listings", "proofs", "hygiene", "orders", "analytics", "settings", "team"] as const;
type Tab = typeof tabs[number];
const tabMeta = {
  overview: { label: "Overview", icon: LayoutDashboard, description: "Platform activity and priorities" },
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
  const { user, hydrated, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("kitchens");
  const [demoScope, setDemoScope] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [admins, setAdmins] = useState<{ id: string; name: string; email: string }[]>([]);
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
        const [summary, kitchenRows] = await Promise.all([api.get<Overview>(`/admin/overview?demo=${demoScope}`), api.get<{ items: Kitchen[] }>("/admin/kitchens")]);
        setOverview(summary);
        setKitchens(kitchenRows.items);
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
        const [leaderboard, demand, revenue, training] = await Promise.all([
          api.get(`/admin/analytics/leaderboard?demo=${demoScope}`),
          api.get(`/admin/analytics/demand?demo=${demoScope}`),
          api.get(`/admin/analytics/revenue?demo=${demoScope}`),
          api.get(`/admin/analytics/training?demo=${demoScope}`),
        ]);
        setAnalytics({ leaderboard, demand, revenue, training } as Analytics);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin data");
    }
  };
  useEffect(() => { void load(); }, [tab, user, demoScope]);
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
    const reason = window.prompt("Reason for rejection");
    if (reason?.trim()) void action(path, { decision: "reject", reason: reason.trim() });
  };

  if (!hydrated || user?.role !== "admin") return null;

  return (
    <div className="admin-shell min-h-dvh bg-[#f7f6f2] text-[#252927] lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="border-b border-[#e4e7e3] bg-[#f0f3ef] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-7">
          <div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b786e]">NearBites</div><div className="mt-1 text-lg font-bold tracking-tight">Admin workspace</div></div>
          <span className="rounded-md bg-[#dce6dc] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#385b43]">{["settings", "team"].includes(tab) ? "Admin" : demoScope ? "Demo" : "Live"}</span>
        </div>
        <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pt-3">
          {tabs.map((name) => { const Icon = tabMeta[name].icon; return (
            <button key={name} type="button" onClick={() => { setTab(name); setError(""); setMessage(""); }} aria-current={tab === name ? "page" : undefined}
              className={"flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#345e43] lg:w-full " + (tab === name ? "bg-[#dce8de] text-[#204a33]" : "text-[#536158] hover:bg-[#e6ebe5] hover:text-[#252927]")}>
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{tabMeta[name].label}</span>
            </button>
          ); })}
        </nav>
        <div className="hidden border-t border-[#dce2db] px-6 py-5 text-xs text-[#66746a] lg:mt-auto lg:block">Signed in as<br /><strong className="mt-1 block truncate font-medium text-[#34473b]">{user.email}</strong></div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e8e3] bg-white/80 px-5 py-5 sm:px-8">
          <div><h1 className="text-xl font-bold tracking-tight">{tabMeta[tab].label}</h1><p className="mt-0.5 text-sm text-[#66716a]">{tabMeta[tab].description}</p></div>
          <div className="flex items-center gap-4 text-sm">{!["settings", "team"].includes(tab) && <button type="button" onClick={() => { setDemoScope(!demoScope); setKitchenFilter(demoScope ? "real" : "sample"); setSelectedKitchen(null); setReview(null); }} className="rounded-lg border border-[#cad9ca] bg-[#edf3eb] px-3 py-2 text-xs font-semibold text-[#315e42]">{demoScope ? "Demo data · switch to live" : "Live data · switch to demo"}</button>}<Link to="/" className="font-medium text-[#345e43] hover:underline">Marketplace</Link><button onClick={async () => { await logout(); navigate({ to: "/admin-login" }); }} className="text-[#66716a] hover:text-[#29372d]">Sign out</button></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:py-8">
        {demoScope && !["settings", "team"].includes(tab) && <p className="mb-5 rounded-lg border border-[#e5d5a8] bg-[#fff7de] px-4 py-3 text-sm text-[#765821]"><strong>Demo data view.</strong> These sample accounts, proofs, listings, orders, reports, and figures are fictional presentation content.</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {message && <p className="mt-3 text-sm text-mehndi">{message}</p>}
        {tab === "overview" && overview && (
          <section>
            <SectionHeading title="Today at a glance" description={demoScope ? "Fictional activity for a complete presentation." : "Live operations, with the items that need an admin decision first."} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: demoScope ? "Demo kitchens" : "Pending kitchen decisions", value: demoScope ? kitchens.filter((k) => k.is_demo).length : kitchens.filter((k) => k.status === "pending").length, target: "kitchens" as Tab, note: "Review sellers" },
                { label: "Training proofs", value: overview.pending_proofs, target: "proofs" as Tab, note: "Inspect evidence" },
                { label: "Dish listings", value: overview.pending_listings, target: "listings" as Tab, note: "Check new dishes" },
                { label: "Hygiene reports", value: overview.open_hygiene_reports, target: "hygiene" as Tab, note: "Read reports" },
              ].map((item) => <button key={item.label} onClick={() => setTab(item.target)} className={`${panel} p-5 text-left transition-colors hover:border-[#8aa88e] hover:bg-[#fbfdf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e42]`}><span className="text-sm font-medium text-[#66716a]">{item.label}</span><span className="mt-2 block text-3xl font-semibold tabular-nums text-[#203f2e]">{item.value}</span><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#315e42]">{item.note}<ChevronRight size={14} aria-hidden="true" /></span></button>)}
            </div>
            {overview.overdue_reviews > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e9d8b9] bg-[#fff7e9] px-5 py-4"><div><p className="font-semibold text-[#765821]">{overview.overdue_reviews} reviews past the target time</p><p className="mt-0.5 text-sm text-[#816d4b]">Open proof and listing queues to clear them.</p></div><button onClick={() => setTab("proofs")} className={quietButton}>Open proof queue</button></div>}
            <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className={`${panel} p-5 sm:p-6`}><h3 className="font-semibold">Orders and revenue</h3><p className="mt-1 text-sm text-[#66716a]">Last seven days · paid, delivered orders</p><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3"><div><p className="text-xs text-[#66716a]">Revenue received</p><p className="mt-1 text-2xl font-semibold tabular-nums">Rs {overview.revenue_pkr.toLocaleString()}</p></div><div><p className="text-xs text-[#66716a]">Delivered orders</p><p className="mt-1 text-2xl font-semibold tabular-nums">{overview.delivered_orders}</p></div><div><p className="text-xs text-[#66716a]">{demoScope ? "Demo kitchens" : "Selling kitchens"}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{overview.active_vendors}</p></div></div>{overview.daily.length > 0 ? <div className="mt-6 space-y-2 border-t border-[#e8ece7] pt-4">{overview.daily.slice(-7).map((day) => <div key={day.day} className="flex items-center justify-between text-sm"><span className="text-[#66716a]">{new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span><span className="tabular-nums">{day.orders} orders · Rs {day.revenue_pkr.toLocaleString()}</span></div>)}</div> : <p className="mt-6 border-t border-[#e8ece7] pt-4 text-sm text-[#66716a]">No delivered orders in this period.</p>}</div>
              <div className={`${panel} p-5 sm:p-6`}><h3 className="font-semibold">Review sequence</h3><p className="mt-1 text-sm text-[#66716a]">A clear path for each new seller.</p><ol className="mt-5 space-y-4">{[["1", "Review the kitchen", "Check seller identity and kitchen details."], ["2", "Inspect training proof", "Read quiz scores and open each submitted image."], ["3", "Decide on listings", "Publish dishes only when the kitchen and training are approved."]].map(([number,title,detail]) => <li key={number} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e4eee3] text-xs font-bold text-[#315e42]">{number}</span><span><strong className="text-sm">{title}</strong><span className="mt-0.5 block text-xs text-[#66716a]">{detail}</span></span></li>)}</ol></div>
            </div>
          </section>
        )}
        {tab === "kitchens" && (
          <section aria-label="Kitchen review workspace">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Kitchen reviews</h2><p className="mt-1 text-sm text-[#66716a]">Select a kitchen to inspect its training and submitted evidence.</p></div>
              <p className="text-sm tabular-nums text-[#536158]">{demoScope ? `${kitchens.filter((k) => k.is_demo).length} demo kitchens` : `${kitchens.filter((k) => k.status === "pending").length} awaiting a kitchen decision`}</p>
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[310px_minmax(0,1fr)] xl:items-start">
              <div className="min-w-0 rounded-xl border border-[#e0e5df] bg-white p-3 shadow-sm">
                {demoScope ? <p className="rounded-lg bg-[#f4f7ef] px-3 py-2 text-xs font-semibold text-[#526c55]">Sample kitchens for presentation</p> : <div className="flex gap-1 rounded-lg bg-[#f2f4f0] p-1" aria-label="Kitchen filters">{([ ["real", "All real"], ["pending", "Pending"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setKitchenFilter(value)} aria-pressed={kitchenFilter === value} className={"flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors " + (kitchenFilter === value ? "bg-white text-[#244c35] shadow-sm" : "text-[#657168] hover:text-[#26372a]")}>{label}</button>)}</div>}
                <label className="mt-3 block text-xs font-semibold text-[#59665c]">Find a kitchen
                  <input type="search" value={kitchenSearch} onChange={(event) => setKitchenSearch(event.target.value)} placeholder="Name, chef, or area" className="mt-1.5 w-full rounded-lg border border-[#dce3dc] bg-white px-3 py-2.5 text-sm text-[#253329] outline-none placeholder:text-[#89958a] focus-visible:border-[#38674a] focus-visible:ring-2 focus-visible:ring-[#38674a]/20" />
                </label>
                <div className="mt-3 max-h-[calc(100dvh-290px)] min-h-40 space-y-1 overflow-y-auto" aria-label="Kitchen list">
                  {visibleKitchens.length === 0 && <p className="px-2 py-5 text-sm text-[#66716a]">No kitchens match this view.</p>}
                  {visibleKitchens.map((kitchen) => <button key={kitchen.id} type="button" onClick={() => void showKitchen(kitchen.id)} aria-pressed={selectedKitchen === kitchen.id}
                    className={"group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38674a] " + (selectedKitchen === kitchen.id ? "bg-[#e5eee5]" : "hover:bg-[#f5f7f3]")}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#26352a]">{kitchen.name}</span><span className="mt-0.5 block truncate text-xs text-[#67736b]">{kitchen.area} · {kitchen.chef}</span><span className="mt-1 block text-[11px] font-medium text-[#56665a]">{kitchen.status === "sample" ? "Sample profile" : kitchen.status === "pending" ? "Kitchen decision needed" : kitchen.status === "active" ? "Active kitchen" : kitchen.status}</span></span>
                    <ChevronRight size={16} className="shrink-0 text-[#88968a]" aria-hidden="true" />
                  </button>)}
                </div>
              </div>
              <div className="min-w-0" aria-label="Kitchen review">
                {!selectedKitchen && <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cdd9ce] bg-white/70 px-6 text-center"><Store size={34} strokeWidth={1.3} className="text-[#65816b]" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">Choose a kitchen to review</h3><p className="mt-1 max-w-sm text-sm text-[#66716a]">Training scores, uploaded photos, and the kitchen decision will appear here.</p></div>}
                {selectedKitchen && !review && <div className="min-h-[480px] animate-pulse rounded-xl border border-[#e0e5df] bg-white p-6"><div className="h-7 w-1/2 rounded bg-[#e7ece5]" /><div className="mt-5 h-20 rounded bg-[#eff2ed]" /><div className="mt-7 h-60 rounded bg-[#eff2ed]" /></div>}
                {review && selectedKitchen === review.kitchen.id && <div className="overflow-hidden rounded-xl border border-[#dce4db] bg-white shadow-sm">
                  <div className="border-b border-[#e7ebe6] px-5 py-5 sm:px-7">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold tracking-tight">{review.kitchen.name}</h3><p className="mt-1 text-sm text-[#66716a]">{review.kitchen.chef} · {review.kitchen.area}</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold capitalize " + (review.kitchen.status === "active" ? "bg-[#e4f0e6] text-[#2c6040]" : review.kitchen.status === "pending" ? "bg-[#fff0d8] text-[#8a5d1b]" : "bg-[#eef0ed] text-[#5f6961]")}>{review.kitchen.status === "sample" ? "Sample profile" : review.kitchen.status}</span></div>
                    {review.kitchen.bio && <p className="mt-3 max-w-2xl text-sm text-[#536158]">{review.kitchen.bio}</p>}
                    <dl className="mt-5 grid gap-4 border-t border-[#edf0eb] pt-4 text-sm sm:grid-cols-3">
                      <div><dt className="text-xs font-medium text-[#69766c]">Seller</dt><dd className="mt-1 font-semibold">{review.seller?.name || "Unknown"}</dd><dd className="break-all text-xs text-[#66716a]">{review.seller?.email}</dd></div>
                      <div><dt className="text-xs font-medium text-[#69766c]">Account and location</dt><dd className="mt-1">{review.seller?.email_verified ? "Email verified" : "Email not verified"}</dd><dd className="text-xs text-[#66716a]">{review.kitchen.location_set ? "Location set" : "Location missing"}</dd></div>
                      <div><dt className="text-xs font-medium text-[#69766c]">Training</dt><dd className="mt-1 font-semibold tabular-nums">{review.modules.filter((module) => module.progress.completed).length} / {review.modules.length} approved</dd><dd className="text-xs text-[#66716a]">{review.modules.filter((module) => module.progress.proof_status === "pending").length} proofs waiting</dd></div>
                    </dl>
                    {review.kitchen.retraining_at && <p className="mt-4 rounded-lg bg-[#fff5e5] px-3 py-2 text-sm text-[#765821]">Retraining required since {new Date(review.kitchen.retraining_at).toLocaleString()}. Earlier attempts do not count.</p>}
                  </div>
                  <div className="px-5 py-5 sm:px-7"><h4 className="text-base font-semibold">Training progress</h4><p className="mt-1 text-sm text-[#66716a]">Review quiz results and submitted proof. Allergens is completed by seller confirmation.</p>
                    <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                      <div className="space-y-1" aria-label="Training lessons">{review.modules.map((module) => <button type="button" key={module.id} onClick={() => setSelectedModule(module.id)} aria-pressed={selectedModule === module.id} className={"flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#38674a] " + (selectedModule === module.id ? "bg-[#e6eee5] text-[#214d32]" : "hover:bg-[#f4f6f2]")}><span className="font-medium">{module.title}</span><span className={"h-2 w-2 shrink-0 rounded-full " + (module.progress.completed ? "bg-[#398258]" : module.progress.proof_status === "pending" ? "bg-[#d29438]" : "bg-[#aeb9ae]")} aria-label={module.progress.completed ? "Approved" : module.progress.proof_status} /></button>)}</div>
                      <div className="min-w-0 rounded-lg border border-[#e5eae3] bg-[#fbfcfa] p-4 sm:p-5">{review.modules.filter((module) => module.id === selectedModule).map((module) => <div key={module.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="text-base font-semibold">{module.title}</h5><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-[#526358] ring-1 ring-[#e0e7df]">{module.progress.completed ? "Complete" : module.id === "allergens" ? module.progress.quiz_passed ? "Awaiting confirmation" : "Quiz needed" : module.progress.proof_status.replaceAll("_", " ")}</span></div>
                        <p className="mt-2 text-sm text-[#5b685e]">{module.id === "allergens" ? "Seller confirmation" : "Expected proof"}: {module.proof_instruction}</p>
                        <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-[#e6ebe5]"><span className="text-xs font-medium text-[#657168]">Latest quiz result</span><p className="mt-1 font-semibold tabular-nums">{module.quiz_attempts.length ? `${module.quiz_attempts[0].score} / ${module.question_count} correct · ${module.quiz_attempts[0].passed ? "Passed" : "Not passed"}` : "No attempt yet"}</p>{module.quiz_attempts.length > 1 && <details className="mt-2 text-xs text-[#657168]"><summary className="cursor-pointer">{module.quiz_attempts.length} attempts</summary>{module.quiz_attempts.map((attempt) => <p key={attempt.id} className="mt-1">{attempt.score}/{module.question_count} · {attempt.passed ? "Passed" : "Not passed"} · {new Date(attempt.submitted_at).toLocaleString()}</p>)}</details>}</div>
                        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-[#315b3e]">See quiz questions and correct answers</summary><ol className="mt-2 list-decimal space-y-2 pl-5 text-[#4d5b50]">{module.questions.map((q) => <li key={q.question}>{q.question}<span className="block text-xs text-[#617267]">Correct: {q.correct_answer}</span></li>)}</ol><p className="mt-2 text-xs text-[#7b877c]">Past selected answers were not stored.</p></details>
                        {module.id === "allergens" ? <div className="mt-5 rounded-lg border border-[#dce4db] bg-white px-4 py-4 text-sm text-[#526358]">{module.progress.acknowledged ? "Seller confirmed understanding after passing the quiz." : module.progress.completed ? "Completed with previously approved proof." : "Waiting for the seller to pass the quiz and confirm understanding."}</div> : module.proofs.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-[#dce4db] px-4 py-7 text-center text-sm text-[#6e7b70]">No evidence submitted for this lesson.</div> : <div className="mt-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold">Latest evidence</p><p className="text-xs text-[#6b776d]">{new Date(module.proofs[0].submitted_at).toLocaleString()}</p></div>{module.proofs[0].camera_check && <p className="mt-2 text-xs text-[#56665b]">Model detected: {module.proofs[0].camera_check.detections.map((d) => `${d.label} ${Math.round(d.confidence * 100)}%`).join(" · ") || "Nothing"}. Check the actual image before approval.</p>}<ProofPreview proof={module.proofs[0]} />{module.proofs[0].reason && <p className="mt-2 text-sm text-[#a23c35]">Previous decision: {module.proofs[0].reason}</p>}{module.proofs[0].status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/training/proofs/${module.proofs[0].id}/decision`, { decision: "approve" })} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm font-semibold text-white hover:bg-[#254d35]">Approve proof</button><button onClick={() => reject(`/admin/training/proofs/${module.proofs[0].id}/decision`)} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm font-medium text-[#9c403b] hover:bg-[#fff3f0]">Reject proof</button></div>}{module.proofs.length > 1 && <details className="mt-4 text-xs text-[#657168]"><summary className="cursor-pointer">{module.proofs.length - 1} earlier submissions</summary>{module.proofs.slice(1).map((proof) => <div key={proof.id} className="mt-3 border-t border-[#e5eae3] pt-3"><p className="font-semibold capitalize">{proof.status} · {new Date(proof.submitted_at).toLocaleString()}</p>{proof.reason && <p>Reason: {proof.reason}</p>}<ProofPreview proof={proof} /></div>)}</details>}</div>}
                      </div>)}</div>
                    </div>
                  </div>
                  {review.kitchen.status !== "sample" && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ebe6] bg-[#f5f8f3] px-5 py-4 sm:px-7"><div><p className="text-sm font-semibold">Kitchen decision</p><p className="mt-0.5 text-xs text-[#68776b]">Listings go public only after kitchen and training approval.</p></div><div className="flex flex-wrap gap-2">{review.kitchen.status === "pending" && <><button onClick={() => void action(`/admin/kitchens/${review.kitchen.id}/decision`, { decision: "approve" })} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm font-semibold text-white hover:bg-[#254d35]">Approve kitchen</button><button onClick={() => reject(`/admin/kitchens/${review.kitchen.id}/decision`)} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm font-medium text-[#9c403b] hover:bg-[#fff3f0]">Reject kitchen</button></>}{review.kitchen.status === "active" && <><button onClick={() => { const reason = window.prompt("Reason for suspension"); if (reason?.trim()) void action(`/admin/vendors/${review.kitchen.id}/suspension`, { reason }); }} className="rounded-lg border border-[#dfc4bf] px-4 py-2 text-sm text-[#9c403b]">Suspend</button><button onClick={() => void action(`/admin/vendors/${review.kitchen.id}/retraining`, {})} className="rounded-lg border border-[#cdd9ce] px-4 py-2 text-sm text-[#315e42]">Require retraining</button></>}{review.kitchen.status === "suspended" && <button onClick={async () => { await api.delete(`/admin/vendors/${review.kitchen.id}/suspension`); await load(); await showKitchen(review.kitchen.id); }} className="rounded-lg bg-[#315e42] px-4 py-2 text-sm text-white">Reinstate</button>}</div></div>}
                </div>}
              </div>
            </div>
          </section>
        )}
        {tab === "listings" && (
          <section><SectionHeading title="Listings awaiting review" description="Check the dish, price, portion, and photo before publishing." count={visibleListings.length} />
            {visibleListings.length === 0 ? <EmptyPanel title="No listings to review" detail="New seller dishes will appear here with their photo and details." /> : <div className="space-y-4">{visibleListings.map((item) => <article key={item.id} className={`${panel} overflow-hidden sm:flex`}><div className="h-48 bg-[#f1f3ee] sm:h-auto sm:w-56 sm:shrink-0">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-[#748075]">No dish photo</div>}</div><div className="min-w-0 flex-1 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-semibold">{item.name}</h3><p className="mt-0.5 text-sm text-[#66716a]">{item.vendor_name} · {item.area}</p></div><StatusPill label="Pending review" tone="warning" /></div><p className="mt-3 max-w-2xl text-sm text-[#536158]">{item.description || "No description provided."}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#ebefea] pt-3 text-sm"><span><strong>Rs {item.price_pkr.toLocaleString()}</strong></span><span className="text-[#66716a]">Portion: {item.portion_size}</span><span className="text-[#66716a]">Available: {item.portions_available}</span></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/listings/${item.id}/decision`, { decision: "approve" })} className={primaryButton}>Approve listing</button><button onClick={() => reject(`/admin/listings/${item.id}/decision`)} className={dangerButton}>Reject listing</button></div></div></article>)}</div>}
          </section>
        )}
        {tab === "buyers" && (
          <section><SectionHeading title="Registered users" description="Real accounts and sample profiles are shown separately." count={buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).length} />
            {buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).length === 0 ? <EmptyPanel title="No users in this view" detail="New accounts will appear here after registration." /> : <div className={`${panel} overflow-hidden`}><div className="hidden grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1fr)_90px] gap-4 border-b border-[#e7ece6] bg-[#f7f9f5] px-5 py-3 text-xs font-semibold text-[#627167] md:grid"><span>Account</span><span>Role</span><span>Email</span><span>Orders</span></div>{buyers.filter((b) => demoScope ? b.is_sample : !b.is_sample).map((buyer) => <div key={buyer.id} className="grid gap-2 border-b border-[#edf0eb] px-5 py-4 text-sm last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1fr)_90px] md:items-center md:gap-4"><div><p className="font-semibold">{buyer.name}</p><p className="text-xs text-[#66716a] md:hidden">{buyer.email}</p></div><div><StatusPill label={buyer.role} /></div><div className="hidden min-w-0 md:block"><p className="truncate text-[#536158]">{buyer.email}</p><p className="text-xs text-[#758177]">{buyer.is_sample ? "Preview account" : buyer.email_verified ? "Email verified" : "Email not verified"}</p></div><span className="tabular-nums text-[#536158]">{buyer.orders}<span className="md:hidden"> orders</span></span></div>)}</div>}
          </section>
        )}
        {tab === "proofs" && (
          <section><SectionHeading title="Training proof queue" description="Open the actual image or video and compare it with the requested lesson evidence." count={visibleProofs.length} />
            {visibleProofs.length === 0 ? <EmptyPanel title="Proof queue is clear" detail="New submissions from sellers will appear here for your review." /> : <div className="grid gap-4 lg:grid-cols-2">{visibleProofs.map((proof) => <article key={proof.id} className={`${panel} min-w-0 overflow-hidden`}><div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8ece7] px-5 py-4"><div><h3 className="font-semibold capitalize">{proof.module_id.replaceAll("-", " ")}</h3><p className="mt-0.5 text-xs text-[#66716a]">{proof.kitchen_name || proof.seller_name || "Seller"} · {new Date(proof.submitted_at).toLocaleString()}</p></div><StatusPill label="Pending" tone="warning" /></div><div className="p-5">{proof.camera_check && <p className="mb-3 rounded-lg bg-[#f1f5ee] px-3 py-2 text-xs text-[#52645a]">Camera model detected {proof.camera_check.detections.map((d) => `${d.label} ${Math.round(d.confidence * 100)}%`).join(" · ") || "no matching objects"}. Inspect the frame yourself.</p>}<ProofPreview proof={proof} /><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void action(`/admin/training/proofs/${proof.id}/decision`, { decision: "approve" })} className={primaryButton}>Approve proof</button><button onClick={() => reject(`/admin/training/proofs/${proof.id}/decision`)} className={dangerButton}>Reject proof</button></div></div></article>)}</div>}
          </section>
        )}
        {tab === "hygiene" && (
          <section><SectionHeading title="Hygiene reports" description="Review buyer reports and record a reason for every resolution." count={visibleFlags.length} />
            {watchlist.length > 0 && <div className="mb-5 rounded-xl border border-[#e8d6b5] bg-[#fff8ea] p-5"><h3 className="font-semibold text-[#765821]">Watchlist</h3><p className="mt-1 text-sm text-[#816d4b]">Kitchens with repeated open reports.</p><div className="mt-3 flex flex-wrap gap-2">{watchlist.map((item) => <span key={item.vendor_id} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#765821]">{item.name} · {item.open_flags} reports</span>)}</div></div>}
            {visibleFlags.length === 0 ? <EmptyPanel title="No open hygiene reports" detail="Buyer reports will appear here with their kitchen and order reference." /> : <div className="space-y-3">{visibleFlags.map((flag) => <article key={flag.id} className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{kitchens.find((k) => k.id === flag.vendor_id)?.name || `Kitchen ${flag.vendor_id.slice(0,8)}`}</h3><p className="mt-1 text-xs text-[#66716a]">Order #{flag.order_id.slice(0,8)} · {new Date(flag.created_at).toLocaleString()}</p></div><StatusPill label="Open" tone="warning" /></div><p className="mt-4 max-w-3xl text-sm text-[#3f4b42]">{flag.description}</p><div className="mt-4 flex flex-wrap gap-2 border-t border-[#e9ede7] pt-4">{(["resolved", "dismissed"] as const).map((status) => <button key={status} onClick={() => { const reason = window.prompt(`Reason for marking this report ${status}`); if (reason?.trim()) void action(`/admin/hygiene/flags/${flag.id}`, { status, reason: reason.trim() }, "patch"); }} className={status === "resolved" ? primaryButton : quietButton}>{status === "resolved" ? "Resolve report" : "Dismiss report"}</button>)}</div></article>)}</div>}
          </section>
        )}
        {tab === "orders" && (
          <section><SectionHeading title="Orders" description="Track handover and confirm cash only after it is received." count={visibleOrders.length} />
            {visibleOrders.length === 0 ? <EmptyPanel title="No orders yet" detail="Placed orders and their fulfilment status will appear here." /> : <div className="space-y-3">{visibleOrders.map((order) => <article key={order.id} className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Order #{order.id.slice(0,8)}</h3><p className="mt-1 text-xs text-[#66716a]">Placed {new Date(order.placed_at).toLocaleString()} · {order.vendor_name} · {order.buyer_name}</p></div><strong className="text-lg tabular-nums">Rs {order.total_pkr.toLocaleString()}</strong></div><div className="mt-4 flex flex-wrap gap-2"><StatusPill label={order.status} tone={order.status === "delivered" ? "success" : order.status === "cancelled" ? "danger" : "warning"} /><StatusPill label={order.payment_status === "paid" ? "Cash received" : "Cash outstanding"} tone={order.payment_status === "paid" ? "success" : "neutral"} /></div><div className="mt-4 flex flex-wrap gap-2 border-t border-[#e9ede7] pt-4">{order.status === "ready" && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "out_for_delivery" }, "patch")} className={primaryButton}>Mark out for delivery</button>}{order.status === "out_for_delivery" && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "delivered" }, "patch")} className={primaryButton}>Mark delivered</button>}{order.status === "delivered" && order.payment_status === "unpaid" && <button onClick={() => void action(`/admin/orders/${order.id}/cash-received`, { amount_pkr: order.total_pkr })} className={primaryButton}>Confirm cash received</button>}{!["delivered", "cancelled", "rejected"].includes(order.status) && <button onClick={() => void action(`/admin/orders/${order.id}/status`, { status: "cancelled" }, "patch")} className={dangerButton}>Cancel order</button>}</div></article>)}</div>}
          </section>
        )}
        {tab === "analytics" && (
          <section><SectionHeading title="Platform analytics" description="Paid revenue, demand, and training in the selected data view." />
            {!analytics ? <div className={`${panel} animate-pulse p-6`}><div className="h-7 w-1/3 rounded bg-[#e8eee6]" /><div className="mt-5 h-48 rounded bg-[#f1f4ef]" /></div> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Paid revenue", `Rs ${analytics.revenue.total_pkr.toLocaleString()}`], ["Seller kitchens", analytics.training.seller_count], ["Training verified", analytics.training.verified_count], ["Pending proofs", analytics.training.pending_proofs]].map(([label,value]) => <div key={label} className={`${panel} p-5`}><p className="text-sm text-[#66716a]">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2">{[["Top kitchens", analytics.leaderboard.vendors.map((item) => ({name:item.name, detail:`Rs ${item.revenue_pkr.toLocaleString()} · ${item.orders} ${item.orders === 1 ? "order" : "orders"}`}))], ["Most ordered dishes", analytics.leaderboard.dishes.map((item) => ({name:item.name, detail:`${item.portions_sold} ${item.portions_sold === 1 ? "portion" : "portions"}`}))], ["Demand by area", analytics.demand.areas.map((item) => ({name:item.area, detail:`${item.orders} ${item.orders === 1 ? "order" : "orders"}`}))], ["Revenue by area", analytics.revenue.areas.map((item) => ({name:item.area, detail:`Rs ${item.revenue_pkr.toLocaleString()}`}))]].map(([title,rows]) => <div key={title as string} className={`${panel} p-5`}><h3 className="font-semibold">{title as string}</h3>{(rows as {name:string;detail:string}[]).length === 0 ? <p className="mt-4 text-sm text-[#66716a]">No completed activity in this period.</p> : <div className="mt-4 divide-y divide-[#e9ede7]">{(rows as {name:string;detail:string}[]).map((row) => <div key={row.name} className="flex justify-between gap-3 py-3 text-sm"><span className="font-medium">{row.name}</span><span className="text-right tabular-nums text-[#66716a]">{row.detail}</span></div>)}</div>}</div>)}</div></>}
          </section>
        )}
        {tab === "settings" && settings && (
          <section><SectionHeading title="Platform settings" description="Rules used by reports and review timing. Changes apply to the live platform." />
            <form onSubmit={(event) => { event.preventDefault(); void action("/admin/settings", settings, "patch"); }} className={`${panel} max-w-2xl overflow-hidden`}><div className="space-y-6 p-5 sm:p-7"><div><h3 className="font-semibold">Review operations</h3><p className="mt-1 text-sm text-[#66716a]">Set when reviews become overdue and when a seller enters the hygiene watchlist.</p></div><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Review target <span className="block text-xs font-normal text-[#66716a]">Hours before a pending review is overdue</span><input type="number" min="1" max="168" value={settings.review_sla_hours} onChange={(event) => setSettings({ ...settings, review_sla_hours: Number(event.target.value) })} className={inputClass} /></label><label className="block text-sm font-medium">Watchlist threshold <span className="block text-xs font-normal text-[#66716a]">Open hygiene reports needed to flag a kitchen</span><input type="number" min="1" max="20" value={settings.hygiene_flag_threshold} onChange={(event) => setSettings({ ...settings, hygiene_flag_threshold: Number(event.target.value) })} className={inputClass} /></label></div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e3e9e1] bg-[#f8faf7] p-4"><input type="checkbox" checked={settings.notifications_enabled} onChange={(event) => setSettings({ ...settings, notifications_enabled: event.target.checked })} className="mt-1 accent-[#315e42]" /><span><strong className="block text-sm">Admin notifications</strong><span className="mt-0.5 block text-xs text-[#66716a]">Send operational notifications when enabled.</span></span></label></div><div className="flex justify-end border-t border-[#e7ece6] bg-[#f7f9f5] px-5 py-4 sm:px-7"><button className={primaryButton}>Save settings</button></div></form>
          </section>
        )}
        {tab === "team" && (
          <section><SectionHeading title="Admin team" description="Invite another administrator and manage existing access." count={admins.length} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"><form onSubmit={async (event) => { event.preventDefault(); try { await api.post("/admin/users/invitations", { email: inviteEmail }); setInviteEmail(""); setMessage("Invitation sent by Brevo."); } catch (err) { setError(err instanceof Error ? err.message : "Could not send invitation"); } }} className={`${panel} h-fit p-5 sm:p-6`}><h3 className="font-semibold">Invite an admin</h3><p className="mt-1 text-sm text-[#66716a]">A code will be emailed to the address below.</p><label className="mt-5 block text-sm font-medium">Email address<input type="email" required placeholder="name@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className={inputClass} /></label><button className={`mt-4 ${primaryButton}`}>Send invitation</button></form><div className={`${panel} overflow-hidden`}><div className="border-b border-[#e7ece6] px-5 py-4"><h3 className="font-semibold">Current administrators</h3></div>{admins.length === 0 ? <p className="p-5 text-sm text-[#66716a]">No admin accounts returned.</p> : <div className="divide-y divide-[#e9ede7]">{admins.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{member.name}{member.id === user.id && <span className="ml-2 text-xs font-normal text-[#66716a]">You</span>}</p><p className="mt-0.5 text-xs text-[#66716a]">{member.email}</p></div>{member.id !== user.id && <button onClick={async () => { try { await api.delete(`/admin/users/${member.id}`); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not remove admin"); } }} className={dangerButton}>Remove access</button>}</div>)}</div>}</div></div>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
