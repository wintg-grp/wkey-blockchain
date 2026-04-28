import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { DetailRow } from "@/components/DetailRow";
import { AddressLink, HashLink } from "@/components/AddressLink";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, gweiFromWei, relativeTime } from "@/lib/format";
import { isExplorerTxObject, type ExplorerTx } from "@/lib/tx";

export const revalidate = 0;

export default async function BlockPage({
  params,
  searchParams,
}: {
  params: { number: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const client = getClient(network);

  const num = params.number.startsWith("0x")
    ? BigInt(params.number)
    : BigInt(parseInt(params.number, 10));

  let block;
  try {
    block = await client.getBlock({ blockNumber: num, includeTransactions: true });
  } catch {
    notFound();
  }
  if (!block) notFound();

  const blockTxs: ExplorerTx[] = [];
  for (const t of block.transactions) {
    if (isExplorerTxObject(t)) blockTxs.push(t);
  }
  const totalWtg = blockTxs.reduce((acc, t) => acc + t.value, 0n);

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text">Block {block.number?.toString()}</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-4 mb-6">
          <h1 className="display text-5xl sm:text-7xl text-text">
            Block <span className="text-accent">#{block.number?.toString()}</span>
          </h1>
          <span className="text-sm text-text-muted">{relativeTime(block.timestamp)}</span>
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={`/block/${(block.number ?? 0n) - 1n}?net=${network}`}
              className="btn-ghost text-sm"
            >
              ← Prev
            </Link>
            <Link
              href={`/block/${(block.number ?? 0n) + 1n}?net=${network}`}
              className="btn-ghost text-sm"
            >
              Next →
            </Link>
          </span>
        </div>

        <section className="card p-6 sm:p-8">
          <DetailRow label="Block height">
            <span className="font-bold text-text">{block.number?.toString()}</span>
          </DetailRow>
          <DetailRow label="Hash">
            <span className="mono break-all">{block.hash}</span>
          </DetailRow>
          <DetailRow label="Parent hash">
            <HashLink hash={block.parentHash} network={network} type="block" truncate={false} />
          </DetailRow>
          <DetailRow label="Validator">
            <AddressLink address={block.miner} network={network} truncate={false} />
          </DetailRow>
          <DetailRow label="Timestamp">
            <span>
              {new Date(Number(block.timestamp) * 1000).toUTCString()}
              <span className="text-text-muted ml-2">({relativeTime(block.timestamp)})</span>
            </span>
          </DetailRow>
          <DetailRow label="Transactions">
            <span className="font-bold text-text">{block.transactions.length}</span>
            <span className="text-text-muted ml-2">· {formatWtg(totalWtg)} WTG</span>
          </DetailRow>
          <DetailRow label="Gas used">
            <span className="mono">{block.gasUsed.toString()}</span>
            <span className="text-text-muted ml-2">/ {block.gasLimit.toString()}</span>
            <span className="ml-2 text-text-muted">
              ({((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(2)}%)
            </span>
          </DetailRow>
          {block.baseFeePerGas && (
            <DetailRow label="Base fee">
              <span className="mono">{gweiFromWei(block.baseFeePerGas)} gwei</span>
            </DetailRow>
          )}
          <DetailRow label="Size">
            <span className="mono">{block.size.toString()} bytes</span>
          </DetailRow>
        </section>

        {blockTxs.length > 0 && (
          <section className="card p-6 sm:p-8 mt-6">
            <h2 className="display text-2xl text-text mb-4">Transactions in this block</h2>
            <ul className="divide-y divide-border">
              {blockTxs.map((t) => (
                <li key={t.hash} className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <HashLink hash={t.hash} network={network} type="tx" />
                    <span className="ml-auto text-sm text-text font-semibold">
                      {formatWtg(t.value)} WTG
                    </span>
                  </div>
                  <div className="text-xs text-text-muted flex flex-wrap items-center gap-x-3">
                    <AddressLink address={t.from} network={network} />
                    <span className="text-text-faint">→</span>
                    {t.to ? (
                      <AddressLink address={t.to} network={network} />
                    ) : (
                      <span className="text-text-faint italic">contract creation</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
