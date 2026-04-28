"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function TokensPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { t } = useSettings();

  const wtgWrapper = "0x59E27B7c9119fC5Ff04C855eEDfeD7c53f24b53C";
  const erc20Factory = ""; // TODO once tokens are deployed

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-5xl sm:text-7xl text-text">{t.nav.tokens}</h1>
        <p className="text-text-muted mt-2 max-w-xl">
          ERC-20 tokens issued on WINTG appear here. The list is populated as tokens are minted via the public token factory.
        </p>

        <section className="card p-6 sm:p-8 mt-8">
          <h2 className="display text-2xl text-text mb-4">Featured</h2>
          <ul className="divide-y divide-border">
            <li className="py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-wintg-gradient grid place-items-center font-display text-accent-fg text-xl">
                W
              </div>
              <div className="flex-1">
                <div className="font-bold text-text">WTG</div>
                <div className="text-xs text-text-muted">Native asset · 1 B supply</div>
              </div>
              <div className="text-right">
                <div className="text-text font-semibold">1 WTG = 50 CFA</div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider">{t.home.initialOffer}</div>
              </div>
            </li>
            <li className="py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-2 grid place-items-center font-display text-text text-xl">
                W
              </div>
              <div className="flex-1">
                <div className="font-bold text-text">WWTG · Wrapped WINTG</div>
                <div className="text-xs text-text-muted">ERC-20 wrapper · 1:1 with native WTG</div>
              </div>
              <Link
                href={`/address/${wtgWrapper}?net=${network}`}
                className="link-accent text-sm"
              >
                View →
              </Link>
            </li>
          </ul>
        </section>

        <section className="card p-6 sm:p-8 mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="display text-2xl text-text">Community tokens</h2>
              <p className="text-text-muted mt-1 text-sm">
                Anyone can deploy an ERC-20 on WINTG via the public factory.
              </p>
            </div>
            {erc20Factory ? (
              <Link href={`/address/${erc20Factory}?net=${network}`} className="btn-primary">
                Open factory
              </Link>
            ) : (
              <span className="pill bg-surface-2 text-text-muted">Soon</span>
            )}
          </div>
          <div className="mt-6 text-center text-text-muted text-sm py-12">
            No community tokens yet. Be the first to ship one — full guide on{" "}
            <a href="https://doc.wintg.network" className="link-accent">doc.wintg.network</a>.
          </div>
        </section>
      </div>
    </PageShell>
  );
}
