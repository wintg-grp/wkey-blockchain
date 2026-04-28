"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

function priceLabel(currency: "cfa" | "usd") {
  if (currency === "cfa") {
    return { amount: "25 000", unit: "CFA" };
  }
  // ~25 000 CFA / 600 ≈ $42
  return { amount: "42", unit: "USD" };
}

export default function ApiPlansPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { t, currency } = useSettings();
  const { amount, unit } = priceLabel(currency);

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center max-w-3xl mx-auto">
          <span className="pill bg-accent/12 text-accent">{t.api.title}</span>
          <h1 className="display text-5xl sm:text-7xl md:text-[8rem] text-text mt-4">
            {t.api.title}
          </h1>
          <p className="mt-4 text-text-muted text-lg">{t.api.subtitle}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-14 max-w-5xl mx-auto">
          {/* Free */}
          <article className="card p-8 sm:p-10">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-text-muted">
              {t.api.free}
            </div>
            <div className="display text-text text-7xl mt-2 leading-none">0</div>
            <div className="text-text-muted">{currency.toUpperCase()} / {t.common.quarter}</div>
            <p className="mt-4 text-text-muted">{t.api.freeHint}</p>
            <ul className="mt-6 space-y-3 text-sm">
              {t.api.free_features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Tick />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="https://doc.wintg.network"
              className="btn-ghost w-full mt-8 justify-center"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.api.docs}
            </a>
          </article>

          {/* Pro */}
          <article className="rounded-3xl bg-inverse text-inverse-fg p-8 sm:p-10 shadow-flat relative overflow-hidden">
            <span className="absolute top-6 right-6 pill bg-accent text-accent-fg font-bold">
              {t.api.pro}
            </span>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-60">
              {t.api.pro}
            </div>
            <div className="display text-7xl mt-2 leading-none">{amount}</div>
            <div className="opacity-70">{unit} / {t.common.quarter}</div>
            <p className="mt-4 opacity-70">{t.api.proHint}</p>
            <ul className="mt-6 space-y-3 text-sm">
              {t.api.pro_features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <TickInverse />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href="mailto:contact@wintg.group" className="btn-primary w-full mt-8 justify-center">
              {t.api.cta}
            </a>
          </article>
        </div>

        <div className="mt-12 text-center text-sm text-text-muted">
          <a href="https://doc.wintg.network" className="link-accent" target="_blank" rel="noopener noreferrer">
            {t.api.docs}
          </a>
          {" · "}
          <a href="/status" className="link-accent">{t.api.status}</a>
        </div>
      </div>
    </PageShell>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5 mt-0.5 text-accent shrink-0">
      <path d="M5 11l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TickInverse() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5 mt-0.5 text-accent shrink-0">
      <path d="M5 11l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
