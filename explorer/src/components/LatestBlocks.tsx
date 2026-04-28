import Link from "next/link";
import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";
import { HashLink } from "./AddressLink";
import { relativeTimeI18n } from "@/lib/format";
import { DICTS, type Lang } from "@/lib/i18n/dict";

const COUNT = 15;

export async function LatestBlocks({
  network,
  lang,
}: {
  network: NetworkKey;
  lang: Lang;
}) {
  const t = DICTS[lang];
  const client = getClient(network);
  const head = await client.getBlockNumber();

  const numbers = Array.from({ length: COUNT }, (_, i) => head - BigInt(i));
  const blocks = await Promise.all(
    numbers.map((n) => client.getBlock({ blockNumber: n }).catch(() => null)),
  );

  return (
    <section className="card p-5 sm:p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="font-display uppercase text-2xl sm:text-3xl tracking-tight-display text-text">
          {t.home.blocksTitle}
        </h2>
        <Link
          href={`/blocks?net=${network}`}
          className="text-xs font-semibold text-accent hover:opacity-80"
        >
          {t.common.viewAll} →
        </Link>
      </header>
      <ul className="divide-y divide-border">
        {blocks.filter(Boolean).map((b) => {
          if (!b) return null;
          return (
            <li key={b.hash} className="py-3 flex items-center gap-3">
              <Link
                href={`/block/${b.number?.toString()}?net=${network}`}
                className="grid place-items-center w-11 h-11 rounded-xl bg-surface-2 text-accent font-display text-base shrink-0 hover:bg-accent hover:text-accent-fg transition-colors"
                aria-label={`Block ${b.number?.toString()}`}
              >
                Bk
              </Link>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text">
                  <Link
                    href={`/block/${b.number?.toString()}?net=${network}`}
                    className="hover:text-accent transition-colors"
                  >
                    #{b.number?.toString()}
                  </Link>
                </div>
                <div className="text-xs text-text-muted truncate">
                  {b.transactions.length} tx · <HashLink hash={b.miner} network={network} type="block" />
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-muted whitespace-nowrap">
                  {relativeTimeI18n(b.timestamp, lang)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
