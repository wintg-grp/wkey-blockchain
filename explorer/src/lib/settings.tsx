"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTS, type Lang, type Translations } from "./i18n/dict";

export type Theme = "auto" | "light" | "dark";
export type Currency = "cfa" | "usd";

interface SettingsContext {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  t: Translations;
}

const Ctx = createContext<SettingsContext | null>(null);

const STORAGE = {
  lang:     "wintg.scan.lang",
  theme:    "wintg.scan.theme",
  currency: "wintg.scan.currency",
};

function readLS<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    // ignore
  }
  return fallback;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved =
    theme === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  root.dataset.theme = resolved;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Defaults: French (FR), CFA, Auto theme
  const [lang, setLangState]         = useState<Lang>("fr");
  const [theme, setThemeState]       = useState<Theme>("auto");
  const [currency, setCurrencyState] = useState<Currency>("cfa");

  // Hydrate from localStorage on the client
  useEffect(() => {
    setLangState(readLS<Lang>(STORAGE.lang, ["fr", "en"], "fr"));
    setThemeState(readLS<Theme>(STORAGE.theme, ["auto", "light", "dark"], "auto"));
    setCurrencyState(readLS<Currency>(STORAGE.currency, ["cfa", "usd"], "cfa"));
  }, []);

  // Re-apply theme when it changes (and follow system prefs in auto mode)
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE.lang, l); } catch {}
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { window.localStorage.setItem(STORAGE.theme, t); } catch {}
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try { window.localStorage.setItem(STORAGE.currency, c); } catch {}
  }, []);

  const value = useMemo<SettingsContext>(
    () => ({
      lang,
      setLang,
      theme,
      setTheme,
      currency,
      setCurrency,
      t: DICTS[lang],
    }),
    [lang, theme, currency, setLang, setTheme, setCurrency],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
