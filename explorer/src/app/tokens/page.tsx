"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { formatPriceFromWtg } from "@/lib/price";
import { Sparkline, mockSeries } from "@/components/Sparkline";
import { VerifiedBadge, type VerifiedTone } from "@/components/VerifiedBadge";

export const dynamic = "force-dynamic";

interface TokenRow {
  slug: string;
  symbol: string;
  name: string;
  type: "native" | "wrapped" | "erc20";
  contract?: string;
  supply?: string;
  pricePerWtg: number;
  glyph: string;
  glyphBg: string;
  /** Verification tier: gold = WINTG-audited, blue = WINTG-factory-minted */
  verified: VerifiedTone;
  /** Mock change % for D/W/M (until indexer ships) */
  change1d: number;
  change7d: number;
  change30d: number;
  traders: number;
  volumeWtg: number;
  /** Seed used to generate the deterministic mini-chart */
  seed: number;
}

const ROWS: TokenRow[] = [
  {
    slug: "wtg",
    symbol: "WTG",
    name: "WINTG",
    type: "native",
    supply: "1 000 000 000",
    pricePerWtg: 1,
    glyph: "W",
    glyphBg: "bg-wintg-gradient",
    verified: "gold",
    change1d: 0,
    change7d: 0,
    change30d: 0,
    traders: 0,
    volumeWtg: 0,
    seed: 1,
  },
  {
    slug: "wwtg",
    symbol: "WWTG",
    name: "Wrapped WINTG",
    type: "wrapped",
    contract: "0x59E27B7c9119fC5Ff04C855eEDfeD7c53f24b53C",
    pricePerWtg: 1,
    glyph: "W",
    glyphBg: "bg-inverse text-inverse-fg",
    verified: "gold",
    change1d: 0.001,
    change7d: 0.005,
    change30d: 0.01,
    traders: 0,
    volumeWtg: 0,
    seed: 2,
  },
];

function fmtPct(n: number): string {
  if (Math.abs(n) < 0.0001) return "0.00%";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function pctClass(n: number): string {
  if (n > 0) return "text-emerald-500";
  if (n < 0) return "text-rose-500";
  return "text-text-muted";
}

export default function TokensPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang, currency } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">{fr ? "Tokens" : "Tokens"}</h1>
        <p className="mt-3 text-text-muted max-w-2xl">
          {fr
            ? "Tous les tokens disponibles sur la chaîne WINTG. Le badge or signale les tokens vérifiés par WINTG, le badge bleu signale les tokens créés via les factories WINTG."
            : "All tokens available on the WINTG chain. The gold badge marks WINTG-verified tokens, the blue badge marks tokens created through the WINTG factories."}
        </p>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <VerifiedBadge tone="gold" size={14} /> {fr ? "Vérifié WINTG" : "WINTG verified"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <VerifiedBadge tone="blue" size={14} /> {fr ? "Créé via WINTG" : "Created via WINTG"}
          </span>
        </div>

        {/* Desktop table */}
        <section className="card mt-8 overflow-hidden hidden lg:block">
          <div className="grid grid-cols-[40px_minmax(180px,2fr)_minmax(110px,1fr)_80px_80px_80px_minmax(100px,1fr)_minmax(120px,1fr)_140px] gap-3 px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div>#</div>
            <div>{fr ? "Token" : "Token"}</div>
            <div className="text-right">{fr ? "Prix" : "Price"}</div>
            <div className="text-right">{fr ? "Jour" : "Day"}</div>
            <div className="text-right">{fr ? "Semaine" : "Week"}</div>
            <div className="text-right">{fr ? "Mois" : "Month"}</div>
            <div className="text-right">{fr ? "Traders" : "Traders"}</div>
            <div className="text-right">{fr ? "Volume" : "Volume"}</div>
            <div className="text-right">{fr ? "30 derniers jours" : "Last 30 days"}</div>
          </div>
          <ul>
            {ROWS.map((r, i) => {
              const series = mockSeries(r.seed, 30, 1, 0.02);
              return (
                <li key={r.slug}>
                  <Link
                    href={`/token/${r.slug}?net=${network}`}
                    className="grid grid-cols-[40px_minmax(180px,2fr)_minmax(110px,1fr)_80px_80px_80px_minmax(100px,1fr)_minmax(120px,1fr)_140px] gap-3 px-5 py-4 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
                  >
                    <div className="text-text-muted">{i + 1}</div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full grid place-items-center font-display text-lg shrink-0 ${r.glyphBg}`}>
                        {r.glyph}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text truncate inline-flex items-center gap-1.5">
                          {r.name}
                          <VerifiedBadge tone={r.verified} size={14} />
                        </div>
                        <div className="text-xs text-text-muted">{r.symbol}</div>
                      </div>
                    </div>
                    <div className="text-right text-text font-semibold tabular-nums">
                      {formatPriceFromWtg(r.pricePerWtg, currency)}
                    </div>
                    <div className={`text-right text-xs tabular-nums ${pctClass(r.change1d)}`}>{fmtPct(r.change1d)}</div>
                    <div className={`text-right text-xs tabular-nums ${pctClass(r.change7d)}`}>{fmtPct(r.change7d)}</div>
                    <div className={`text-right text-xs tabular-nums ${pctClass(r.change30d)}`}>{fmtPct(r.change30d)}</div>
                    <div className="text-right text-xs text-text-muted tabular-nums">
                      {r.traders > 0 ? r.traders.toLocaleString("fr-FR") : "—"}
                    </div>
                    <div className="text-right text-xs text-text-muted tabular-nums">
                      {r.volumeWtg > 0 ? `${r.volumeWtg.toLocaleString("fr-FR")} WTG` : "—"}
                    </div>
                    <div className="flex items-center justify-end">
                      <Sparkline data={series} width={130} height={32} trend="auto" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Mobile / tablet card list */}
        <section className="mt-8 grid gap-3 lg:hidden">
          {ROWS.map((r) => {
            const series = mockSeries(r.seed, 30, 1, 0.02);
            return (
              <Link
                key={r.slug}
                href={`/token/${r.slug}?net=${network}`}
                className="card card-hover p-4 flex items-center gap-3"
              >
                <div className={`w-12 h-12 rounded-full grid place-items-center font-display text-xl shrink-0 ${r.glyphBg}`}>
                  {r.glyph}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text truncate inline-flex items-center gap-1.5">
                    {r.name}
                    <VerifiedBadge tone={r.verified} size={14} />
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {r.symbol} · {formatPriceFromWtg(r.pricePerWtg, currency)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums">
                    <span className={pctClass(r.change1d)}>D {fmtPct(r.change1d)}</span>
                    <span className={pctClass(r.change7d)}>W {fmtPct(r.change7d)}</span>
                    <span className={pctClass(r.change30d)}>M {fmtPct(r.change30d)}</span>
                  </div>
                </div>
                <Sparkline data={series} width={80} height={36} trend="auto" />
              </Link>
            );
          })}
        </section>

        <p className="mt-6 text-xs text-text-muted">
          {fr
            ? "Les tokens créés via les factories publiques apparaîtront automatiquement ici une fois l'indexeur mis en ligne. Les valeurs Jour / Semaine / Mois / Volume seront alors réelles."
            : "Tokens minted through the public factories will surface here automatically once the indexer ships. The Day / Week / Month / Volume values will then be live."}
        </p>
      </div>
    </PageShell>
  );
}
