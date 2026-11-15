import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { urdu } from "./urdu";

type Language = "en" | "ur";
type Values = Record<string, string | number>;
export type Translate = (message: string, values?: Values) => string;
const storageKey = "nearbites-language";
const translateEnglish: Translate = (message, values) => interpolate(message, values);

function formats(language: Language) {
  const locale = language === "ur" ? "ur-PK" : "en-PK";
  return {
    formatDate: (date: string) => new Intl.DateTimeFormat(locale, {
      weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(new Date(date + "T00:00:00Z")),
    formatTime: (time: string) => new Intl.DateTimeFormat(locale, {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
    }).format(new Date("2020-01-01T" + time + ":00Z")),
    money: (amount: number) => language === "ur" ? `${amount.toLocaleString(locale)} روپے` : `Rs ${amount.toLocaleString(locale)}`,
  };
}

const LanguageContext = createContext({
  language: "en" as Language, t: translateEnglish, setLanguage: (_: Language) => {}, ...formats("en"),
});

function interpolate(message: string, values?: Values) {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => String(values?.[key] ?? match));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "ur" || stored === "en") setLanguage(stored);
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) setLanguage(event.newValue === "ur" ? "ur" : "en");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);
  const t: Translate = (message, values) => {
    if (language === "en") return interpolate(message, values);
    if (Object.hasOwn(urdu, message)) return interpolate(urdu[message], values);
    const capacity = /^This plan is full on (.+)\. Try another weekday or start date\.$/.exec(message);
    if (capacity) {
      const date = capacity[1].replace(/[A-Za-z]+/g, (month) => urdu[month] ?? month);
      return interpolate(urdu["This plan is full on {date}. Try another weekday or start date."], { date });
    }
    const recommendation = /^You have ordered from (.+) before$/.exec(message);
    if (recommendation) return interpolate(urdu["You have ordered from {kitchen} before"], { kitchen: recommendation[1] });
    const reports = /^Kitchen has (\d+) open hygiene reports$/.exec(message);
    if (reports) return interpolate(urdu["Kitchen has {count} open hygiene reports"], { count: reports[1] });
    const wait = /^Waiting beyond the (\d+)-hour review target$/.exec(message);
    if (wait) return interpolate(urdu["Waiting beyond the {count}-hour review target"], { count: wait[1] });
    const quiz = /^(\d+) of (\d+) correct\. Review the lesson and try again\.$/.exec(message);
    if (quiz) return interpolate(urdu["{score} of {total} correct. Review the lesson and try again."], { score: quiz[1], total: quiz[2] });
    return interpolate(message, values);
  };
  return <LanguageContext.Provider value={{
    language, t,
    ...formats(language),
    setLanguage: (value) => { localStorage.setItem(storageKey, value); setLanguage(value); },
  }}>
    <DirectionProvider dir={language === "ur" ? "rtl" : "ltr"}>{children}</DirectionProvider>
  </LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();
  return <div role="group" aria-label={t("Language")} dir="ltr" className="inline-flex shrink-0 items-center rounded-full border border-border bg-card p-0.5 text-xs">
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}
      className="rounded-full px-2 py-1.5 font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">English</button>
    <button type="button" lang="ur" aria-pressed={language === "ur"} onClick={() => setLanguage("ur")}
      className="rounded-full px-2 py-1.5 font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">اردو</button>
  </div>;
}
