import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";
import { AddressLink, HashLink } from "./AddressLink";
import { formatWtg, relativeTime } from "@/lib/format";
import { isExplorerTxObject, type ExplorerTx } from "@/lib/tx";

const SCAN_BLOCKS = 8;
const MAX_TX = 8;

type TxRow = ExplorerTx & { blockNumber: bigint | null; timestamp: bigint };

export async function LatestTransactions({ network }: { network: NetworkKey }) {
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
    for (const t of b.transactions) {
      if (!isExplorerTxObject(t)) continue;
      txs.push({
        hash: t.hash,
        from: t.from,
        to: t.to,
        value: t.value,
        blockNumber: b.number,
        timestamp: b.timestamp,
      });
      if (txs.length >= MAX_TX) break;
    }
    if (txs.length >= MAX_TX) break;
  }

  return (
    <section className="card p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-white text-base">Latest transactions</h2>
        <span className="text-xs text-ink-400">last {SCAN_BLOCKS} blocks</span>
      </header>

      {txs.length === 0 ? (
        <div className="py-10 text-center text-sm text-ink-400">
          No transactions in the last {SCAN_BLOCKS} blocks.
        </div>
      ) : (
        <ul className="divide-y divide-ink-800/60">
          {txs.map((t) => (
            <li
              key={t.hash}
              className="py-3 hover:bg-ink-800/30 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="pill bg-wintg-500/15 text-wintg-500">tx</span>
                <HashLink hash={t.hash} network={network} type="tx" />
                <span className="ml-auto text-xs text-ink-400">{relativeTime(t.timestamp)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                <span>From</span>
                <AddressLink address={t.from} network={network} />
                {t.to && (
                  <>
                    <span className="text-ink-500">→</span>
                    <AddressLink address={t.to} network={network} />
                  </>
                )}
                {!t.to && <span className="text-ink-500 italic">(contract creation)</span>}
                <span className="ml-auto text-ink-200 font-medium">
                  {formatWtg(t.value)} WTG
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
