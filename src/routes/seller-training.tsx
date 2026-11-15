import { useLanguage } from "@/lib/language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TrainingCameraCheck } from "@/components/TrainingCameraCheck";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/seller-training")({
  head: () => ({ meta: [{ title: "Seller training — NearBites" }] }),
  component: TrainingPage,
});

type Module = {
  id: string; title: string; description: string; steps: string[];
  source_url: string | null; proof_instruction: string;
  questions: { q: string; options: string[] }[];
};
type Progress = {
  module_id: string; quiz_attempted: boolean; quiz_passed: boolean;
  proof_status: string; rejection_reason: string | null; acknowledged: boolean; completed: boolean;
};

function lessonStatus(moduleId: string, state?: Progress) {
  if (state?.completed) return moduleId === "allergens" ? "Completed" : "Approved";
  if (moduleId === "allergens" && state?.quiz_passed) return "Confirm understanding";
  if (state?.proof_status === "pending") return "Admin review";
  if (state?.proof_status === "rejected") return "Proof needs changes";
  if (state?.quiz_passed) return "Proof needed";
  if (state?.quiz_attempted) return "Retry quiz";
  return "Ready to learn";
}

function TrainingPage() {
  const { t } = useLanguage();
  const { user, hydrated } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [verified, setVerified] = useState(false);
  const [kitchenStatus, setKitchenStatus] = useState("");
  const [needsKitchen, setNeedsKitchen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quizOpenId, setQuizOpenId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    let curriculumItems: Module[] = [];
    try {
      const curriculum = await api.get<{ items: Module[] }>("/training/modules");
      curriculumItems = curriculum.items;
      setModules(curriculum.items);
      const state = await api.get<{ modules: Progress[]; training_verified: boolean; kitchen_status: string }>("/seller/training");
      setProgress(state.modules);
      setVerified(state.training_verified);
      setKitchenStatus(state.kitchen_status);
      setNeedsKitchen(false);
      setActiveId((current) => current ?? curriculum.items.find((module) => !state.modules.find((item) => item.module_id === module.id)?.completed)?.id ?? curriculum.items[0]?.id ?? null);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNeedsKitchen(true);
        setActiveId((current) => current ?? curriculumItems[0]?.id ?? null);
      }
      else setError(err instanceof Error ? err.message : "Could not load training");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (user) { setLoading(true); void load(); }
    else setLoading(false);
  }, [hydrated, user]);

  const submitQuiz = async (module: Module) => {
    const selected = answers[module.id] || [];
    if (selected.length !== module.questions.length || selected.some((item) => item === undefined)) {
      setFeedback((current) => ({ ...current, [module.id]: "Answer every question before submitting." }));
      return;
    }
    setBusyId(module.id);
    setError("");
    try {
      const result = await api.post<{ passed: boolean; score: number; total: number }>(
        "/seller/training/" + module.id + "/quiz-attempts", { answers: selected },
      );
      setFeedback((current) => ({ ...current, [module.id]: result.passed
        ? module.id === "allergens" ? "Quiz passed. Confirm your understanding below." : "Quiz passed. Next, submit the proof described below."
        : `${result.score} of ${result.total} correct. Review the lesson and try again.` }));
      if (result.passed) setQuizOpenId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit quiz");
    } finally { setBusyId(null); }
  };

  const submitProof = async (module: Module) => {
    const file = files[module.id];
    if (!file) return;
    setBusyId(module.id);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api.post("/seller/training/" + module.id + "/proofs", body);
      setFeedback((current) => ({ ...current, [module.id]: "Proof sent. An admin will review it." }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload proof");
    } finally { setBusyId(null); }
  };

  const acknowledgeAllergens = async (module: Module) => {
    setBusyId(module.id);
    setError("");
    try {
      await api.post("/seller/training/" + module.id + "/acknowledgements", { understood: true });
      setFeedback((current) => ({ ...current, [module.id]: "Understanding confirmed. This lesson is complete." }));
      await load();
      const nextModule = modules.slice(modules.findIndex((item) => item.id === module.id) + 1)[0];
      setActiveId(nextModule?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm understanding");
      setFeedback((current) => ({ ...current, [module.id]: "Could not save your confirmation. Please try again." }));
    } finally { setBusyId(null); }
  };

  const completedCount = modules.filter((module) => progress.find((item) => item.module_id === module.id)?.completed).length;
  const canTrain = Boolean(user?.email_verified && !needsKitchen);

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
        <Link to="/dashboard" className="text-sm font-semibold text-primary">{t("← Back to kitchen")}</Link>
        <h1 className="mt-4 font-display text-3xl font-bold">{t("Become ready to sell")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("Complete five short lessons. Pass each quiz, confirm your understanding of allergens, and send photo or video proof for the other lessons.")}</p>

        <section className="mt-5 rounded-3xl border border-border bg-card p-5" aria-label={t("Training progress")}>
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Your progress")}</p>
              <p className="mt-1 font-display text-2xl font-bold">{completedCount} {t("of")} {modules.length || 5} {t("lessons complete")}</p></div>
            <span className="text-sm font-semibold text-primary">{Math.round((completedCount / (modules.length || 5)) * 100)}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={modules.length || 5} aria-label={t("Completed lessons")}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completedCount / (modules.length || 5)) * 100}%` }} />
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <p><strong>{t("1. Learn and quiz")}</strong><br />{t("Read the lesson, then answer every question.")}</p>
            <p><strong>{t("2. Confirm or send proof")}</strong><br />{t("Confirm your understanding for Allergens. Send camera or file proof for the other lessons.")}</p>
            <p><strong>{t("3. Admin review")}</strong><br />{t("An admin reviews submitted proof. Allergens is complete after your confirmation.")}</p>
          </div>
        </section>

        {hydrated && !user && <p className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm">{t("Please")} <Link to="/login" className="font-semibold text-primary underline">{t("log in")}</Link> {t("to start training.")}</p>}
        {user && !user.email_verified && <p className="mt-5 rounded-2xl border border-spice bg-spice/10 p-4 text-sm">{t("First,")} <Link to="/verify-email" className="font-semibold text-primary underline">{t("verify your email")}</Link>{t(". You can read the lessons now, but proof needs a verified account.")}</p>}
        {user && needsKitchen && <p className="mt-5 rounded-2xl border border-spice bg-spice/10 p-4 text-sm">{t("First,")} <Link to="/dashboard" className="font-semibold text-primary underline">{t("create your kitchen")}</Link>{t(". Your progress will then appear here.")}</p>}
        {verified && <p className="mt-5 rounded-2xl bg-mehndi/15 p-4 text-sm font-semibold text-mehndi">{t("All five lessons are complete.")} {kitchenStatus === "active" ? t("Your kitchen is approved; you can create listings.") : t("Your kitchen also needs admin approval before you can sell.")}</p>}
        {error && <p className="mt-5 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive" role="alert">{t(error)}</p>}
        {loading && <p className="mt-6 text-sm text-muted-foreground">{t("Loading your training…")}</p>}

        <div className="mt-6 space-y-3">
          {modules.map((module, index) => {
            const state = progress.find((item) => item.module_id === module.id);
            const expanded = activeId === module.id;
            return (
              <section key={module.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button type="button" onClick={() => setActiveId(expanded ? null : module.id)} aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-4 p-5 text-start">
                  <span className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">{state?.completed ? "✓" : index + 1}</span>
                    <span><span className="block font-display text-lg font-bold">{t(module.title)}</span><span className="mt-1 block text-xs text-muted-foreground">{t(module.description)}</span></span>
                  </span>
                  <span className="shrink-0 text-end"><span className="block text-xs font-semibold text-primary">{t(lessonStatus(module.id, state))}</span><span className="text-xs text-muted-foreground">{expanded ? t("Hide") : t("Open")}</span></span>
                </button>
                {expanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4">
                    <h3 className="text-sm font-bold">{t("What you need to know")}</h3>
                    <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm leading-relaxed">{module.steps.map((step) => <li key={step}>{t(step)}</li>)}</ol>
                    {module.source_url && <a href={module.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-primary underline">{t("Food safety guidance from WHO ↗")}</a>}
                    <div className="mt-5 rounded-xl bg-secondary/50 p-4"><h3 className="text-sm font-bold">{module.id === "allergens" ? t("How to complete this lesson") : t("Proof you will send")}</h3><p className="mt-1 text-sm">{t(module.proof_instruction)}</p></div>

                    {state?.completed ? (
                      <p className="mt-5 text-sm font-semibold text-mehndi">✓ {module.id === "allergens" ? t("Quiz passed and understanding confirmed.") : t("Quiz and proof approved.")} {t("This lesson is complete.")}</p>
                    ) : module.id !== "allergens" && state?.proof_status === "pending" ? (
                      <p className="mt-5 rounded-xl bg-spice/10 p-3 text-sm">{t("Proof submitted. An admin is reviewing it. You can work on another lesson while you wait.")}</p>
                    ) : !state?.quiz_passed ? (
                      <div className="mt-5">
                        <h3 className="text-sm font-bold">{t("Step 1 · Pass the quiz")}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t("All answers must be correct. You can review this lesson and retry.")}</p>
                        {quizOpenId !== module.id ? (
                          <button type="button" onClick={() => setQuizOpenId(module.id)} disabled={!canTrain}
                            className="mt-3 rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{state?.quiz_attempted ? t("Retry quiz") : t("Start quiz")}</button>
                        ) : (
                          <div className="mt-4 space-y-5">
                            {module.questions.map((question, questionIndex) => (
                              <fieldset key={question.q}><legend className="text-sm font-semibold">{questionIndex + 1}. {t(question.q)}</legend>
                                <div className="mt-2 space-y-2">{question.options.map((option, optionIndex) => (
                                  <label key={option} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 text-sm">
                                    <input type="radio" name={module.id + "-" + questionIndex}
                                      checked={answers[module.id]?.[questionIndex] === optionIndex}
                                      onChange={() => setAnswers((current) => { const next = [...(current[module.id] || [])]; next[questionIndex] = optionIndex; return { ...current, [module.id]: next }; })} />
                                    {t(option)}
                                  </label>
                                ))}</div>
                              </fieldset>
                            ))}
                            <button type="button" onClick={() => submitQuiz(module)} disabled={busyId === module.id}
                              className="rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === module.id ? t("Checking answers…") : t("Check answers")}</button>
                          </div>
                        )}
                      </div>
                    ) : module.id === "allergens" ? (
                      <div className="mt-5">
                        <h3 className="text-sm font-bold">{t("Step 2 · Confirm understanding")}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t("Do you understand that you must list known ingredients and allergens in each dish description and answer buyers’ allergy questions honestly?")}</p>
                        <button type="button" onClick={() => acknowledgeAllergens(module)} disabled={busyId === module.id}
                          className="mt-3 rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === module.id ? t("Saving…") : t("Yes, I understand")}</button>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <h3 className="text-sm font-bold">{t("Step 2 · Send proof")}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t("Your quiz is passed. An admin will approve or reject the proof after you submit it.")}</p>
                        {state.proof_status === "rejected" && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t("Proof needs changes:")} {state.rejection_reason || t("Please capture or upload a clearer example.")}</p>}
                        <TrainingCameraCheck moduleId={module.id} onSubmitted={load} />
                        {module.id !== "food-safety" && (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="mb-3 text-sm font-semibold">{t("Or upload an existing photo or video")}</p>
                            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" aria-label={t("Choose proof for {lesson}", { lesson: t(module.title) })}
                              onChange={(event) => setFiles((current) => ({ ...current, [module.id]: event.target.files?.[0] || null }))} className="block w-full text-sm" />
                            <p className="mt-1 text-xs text-muted-foreground">{t("JPEG, PNG, WebP up to 10 MB, or MP4 up to 25 MB.")}</p>
                            <button type="button" onClick={() => submitProof(module)} disabled={!files[module.id] || busyId === module.id}
                              className="mt-3 rounded-xl bg-gradient-spice px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === module.id ? t("Sending proof…") : t("Send for admin review")}</button>
                          </div>
                        )}
                      </div>
                    )}
                    {feedback[module.id] && <p className="mt-4 text-sm font-semibold text-primary" role="status">{t(feedback[module.id])}</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
