"use client";

import { PageShell } from "./PageShell";
import { useSettings } from "@/lib/settings";
import type { NetworkKey } from "@/lib/networks";

interface Feature {
  title: string;
  description: string;
  bullets?: string[];
}

export function FeaturePreview({
  network,
  fr,
  en,
}: {
  network: NetworkKey;
  fr: Feature;
  en: Feature;
}) {
  const { lang } = useSettings();
  const t = lang === "fr" ? fr : en;
  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <span className="pill bg-accent/12 text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
          {lang === "fr" ? "En préparation" : "In progress"}
        </span>
        <h1 className="display text-5xl sm:text-7xl text-text mt-4">{t.title}</h1>
        <p className="mt-5 text-text-muted text-lg leading-relaxed">{t.description}</p>

        {t.bullets && (
          <ul className="mt-8 space-y-3">
            {t.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-text-muted">{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
