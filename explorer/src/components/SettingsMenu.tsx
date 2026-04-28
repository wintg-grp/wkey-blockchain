"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings, type Theme, type Currency } from "@/lib/settings";
import type { Lang } from "@/lib/i18n/dict";

// Sliders/equalizer icon — feels more like an in-app preferences control
// than a literal "gear", and reads better at small sizes.
const SETTINGS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="4"  y1="6"  x2="4"  y2="18" />
    <circle cx="4"  cy="9"  r="2" fill="currentColor" stroke="none" />
    <line x1="12" y1="6"  x2="12" y2="18" />
    <circle cx="12" cy="14" r="2" fill="currentColor" stroke="none" />
    <line x1="20" y1="6"  x2="20" y2="18" />
    <circle cx="20" cy="10" r="2" fill="currentColor" stroke="none" />
  </svg>
);

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-2xl bg-surface-2 border border-border">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all focus-ring ${
              active
                ? "bg-accent text-accent-fg shadow-flat"
                : "text-text-muted hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const { lang, setLang, theme, setTheme, currency, setCurrency, t } = useSettings();
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          {t.settings.language}
        </div>
        <Choice<Lang>
          value={lang}
          onChange={setLang}
          options={[
            { value: "fr", label: "Français" },
            { value: "en", label: "English" },
          ]}
        />
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          {t.settings.currency}
        </div>
        <Choice<Currency>
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "cfa", label: "CFA" },
            { value: "usd", label: "USD" },
          ]}
        />
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          {t.settings.theme}
        </div>
        <Choice<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "auto",  label: t.settings.themeAuto },
            { value: "light", label: t.settings.themeLight },
            { value: "dark",  label: t.settings.themeDark },
          ]}
        />
      </div>

      <button onClick={onClose} className="btn-ghost w-full">
        {t.common.close}
      </button>
    </div>
  );
}

export function SettingsMenu() {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={t.nav.settings}
        className="btn-ghost !px-3"
      >
        {SETTINGS_ICON}
      </button>

      {open && !isMobile && (
        <div
          ref={popoverRef}
          className="absolute right-4 top-full mt-2 w-80 card shadow-flat z-40 animate-fade-in-up"
        >
          <SettingsBody onClose={() => setOpen(false)} />
        </div>
      )}

      {open && isMobile && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            ref={popoverRef}
            className="relative w-full bg-surface rounded-t-3xl border-t border-border animate-fade-in-up"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-text-faint rounded-full" />
            </div>
            <SettingsBody onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
