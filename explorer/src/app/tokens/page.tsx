"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { formatPriceFromWtg } from "@/lib/price";

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
  },
];

export default function TokensPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang, currency } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">{fr ? "Tokens" : "Tokens"}</h1>
        <p className="mt-3 text-text-muted max-w-2xl">
          {fr
            ? "Tous les tokens disponibles sur la chaîne WINTG. Cliquez sur une ligne pour voir les détails du token."
            : "All tokens available on the WINTG chain. Click a row to see the token details."}
        </p>

        <section className="card mt-10 overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div className="col-span-1">#</div>
            <div className="col-span-5">{fr ? "Token" : "Token"}</div>
            <div className="col-span-2">{fr ? "Type" : "Type"}</div>
            <div className="col-span-2 text-right">{fr ? "Supply" : "Supply"}</div>
            <div className="col-span-2 text-right">{fr ? "Prix" : "Price"}</div>
          </div>
          <ul>
            {ROWS.map((r, i) => (
              <li key={r.slug}>
                <Link
                  href={`/token/${r.slug}?net=${network}`}
                  className="grid grid-cols-12 gap-3 px-5 py-4 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
                >
                  <div className="col-span-1 text-text-muted">{i + 1}</div>
                  <div className="col-span-5 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full grid place-items-center font-display text-xl ${r.glyphBg}`}>
                      {r.glyph}
                    </div>
                    <div>
                      <div className="font-semibold text-text">{r.name}</div>
                      <div className="text-xs text-text-muted">{r.symbol}</div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="pill bg-surface-2 text-text-muted uppercase text-[10px] tracking-wider">
                      {r.type === "native" ? (fr ? "Natif" : "Native") : r.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-text-muted">{r.supply ?? "—"}</div>
                  <div className="col-span-2 text-right">
                    <div className="text-text font-semibold">{formatPriceFromWtg(r.pricePerWtg, currency)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-xs text-text-muted">
          {fr
            ? "Les tokens créés via les factories publiques apparaîtront automatiquement ici une fois l'indexeur mis en ligne."
            : "Tokens minted through the public factories will surface here automatically once the indexer ships."}
        </p>
      </div>
    </PageShell>
  );
}
