"use client";

import { PageShell } from "./PageShell";
import { useSettings } from "@/lib/settings";

export function ComingSoonPage({
  network,
  title,
  description,
}: {
  network: "mainnet" | "testnet";
  title: string;
  description?: string;
}) {
  const { t } = useSettings();
  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <span className="pill bg-accent/12 text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
          {t.comingSoon.title}
        </span>
        <h1 className="display text-5xl sm:text-7xl text-text mt-6">{title}</h1>
        {description && (
          <p className="mt-4 text-text-muted text-lg">{description}</p>
        )}
        <p className="mt-2 text-text-muted">{t.comingSoon.body}</p>
      </div>
    </PageShell>
  );
}
