import Link from "next/link";
import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";
import { AddressLink, HashLink } from "./AddressLink";
import { formatWtg, relativeTimeI18n } from "@/lib/format";
import { isExplorerTxObject, type ExplorerTx } from "@/lib/tx";
import { DICTS, type Lang } from "@/lib/i18n/dict";

const SCAN_BLOCKS = 30;
const MAX_TX = 15;

type TxRow = ExplorerTx & { blockNumber: bigint | null; timestamp: bigint };

export async function LatestTransactions({
  network,
  lang,
}: {
  network: NetworkKey;
  lang: Lang;
}) {
  const t = DICTS[lang];
  const client = getClient(network);
  const head = await client.getBlockNumber();

  const blocks = await Promise.all(
    Array.from({ length: SCAN_BLOCKS }, (_, i) =>
      client
        .getBlock({ blockNumber: head - BigInt(i), includeTransactions: true })
        .catch(() => null),
    ),
  );

  const txs: TxRow[] = [];
  for (const b of blocks) {
    if (!b) continue;
    for (const tx of b.transactions) {
      if (!isExplorerTxObject(tx)) continue;
      txs.push({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        blockNumber: b.number,
        timestamp: b.timestamp,
      });
      if (txs.length >= MAX_TX) break;
    }
    if (txs.length >= MAX_TX) break;
  }

  return (
    <section className="card p-5 sm:p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="font-display uppercase text-2xl sm:text-3xl tracking-tight-display text-text">
          {t.home.txsTitle}
        </h2>
        <Link
          href={`/txs?net=${network}`}
          className="text-xs font-semibold text-accent hover:opacity-80"
        >
          {t.common.viewAll} →
        </Link>
      </header>

      {txs.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-muted">
          —
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {txs.map((row) => (
            <li key={row.hash} className="py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="pill bg-accent/12 text-accent">tx</span>
                <HashLink hash={row.hash} network={network} type="tx" />
                <span className="ml-auto text-xs text-text-muted">{relativeTimeI18n(row.timestamp, lang)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <AddressLink address={row.from} network={network} />
                <span className="text-text-faint">→</span>
                {row.to ? (
                  <AddressLink address={row.to} network={network} />
                ) : (
                  <span className="text-text-faint italic">contract</span>
                )}
                <span className="ml-auto text-text font-semibold">
                  {formatWtg(row.value)} WTG
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
