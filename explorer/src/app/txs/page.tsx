import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { AddressLink, HashLink } from "@/components/AddressLink";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, relativeTime } from "@/lib/format";
import { isExplorerTxObject, type ExplorerTx } from "@/lib/tx";

export const revalidate = 0;
const SCAN_BLOCKS = 60;
const MAX_TX = 100;

type Row = ExplorerTx & { blockNumber: bigint | null; timestamp: bigint };

export default async function TxsPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const client = getClient(network);
  const head = await client.getBlockNumber();

  const blocks = await Promise.all(
    Array.from({ length: SCAN_BLOCKS }, (_, i) =>
      client
        .getBlock({ blockNumber: head - BigInt(i), includeTransactions: true })
        .catch(() => null),
    ),
  );

  const rows: Row[] = [];
  for (const b of blocks) {
    if (!b) continue;
    for (const t of b.transactions) {
      if (!isExplorerTxObject(t)) continue;
      rows.push({
        hash: t.hash,
        from: t.from,
        to: t.to,
        value: t.value,
        blockNumber: b.number,
        timestamp: b.timestamp,
      });
      if (rows.length >= MAX_TX) break;
    }
    if (rows.length >= MAX_TX) break;
  }

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-5xl sm:text-7xl text-text">Transactions</h1>
        <p className="text-text-muted mt-2">Last {rows.length} transactions on {network}.</p>

        <section className="card mt-8 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div className="col-span-3">Hash</div>
            <div className="col-span-2">Block</div>
            <div className="col-span-3">From</div>
            <div className="col-span-2">To</div>
            <div className="col-span-2 text-right">Value</div>
          </div>
          <ul>
            {rows.map((r) => (
              <li
                key={r.hash}
                className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <div className="col-span-3"><HashLink hash={r.hash} network={network} type="tx" /></div>
                <div className="col-span-2">
                  {r.blockNumber !== null && (
                    <Link href={`/block/${r.blockNumber}?net=${network}`} className="link-accent text-sm">
                      #{r.blockNumber.toString()}
                    </Link>
                  )}
                  <div className="text-[10px] text-text-faint">{relativeTime(r.timestamp)}</div>
                </div>
                <div className="col-span-3"><AddressLink address={r.from} network={network} /></div>
                <div className="col-span-2">
                  {r.to ? (
                    <AddressLink address={r.to} network={network} />
                  ) : (
                    <span className="text-text-faint italic text-sm">contract</span>
                  )}
                </div>
                <div className="col-span-2 text-right text-text font-semibold">
                  {formatWtg(r.value)} <span className="text-text-muted">WTG</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
