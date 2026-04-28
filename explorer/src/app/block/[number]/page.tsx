import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { DetailRow } from "@/components/DetailRow";
import { AddressLink, HashLink } from "@/components/AddressLink";
import { CopyButton } from "@/components/Copy";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, gweiFromWei, relativeTime } from "@/lib/format";
import { isExplorerTxObject, type ExplorerTx } from "@/lib/tx";

export const revalidate = 0;

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
        {label}
      </div>
      <div className="mt-1.5 font-display text-text text-2xl sm:text-3xl leading-none tracking-tight-display">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

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
  const gasPct = (Number(block.gasUsed) / Number(block.gasLimit)) * 100;

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <Link href={`/blocks?net=${network}`} className="hover:text-text">Blocks</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text">#{block.number?.toString()}</span>
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

        {/* Stat boxes at the top */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <MiniStat
            label="Transactions"
            value={blockTxs.length}
            hint={`${formatWtg(totalWtg)} WTG transferred`}
          />
          <MiniStat
            label="Gas used"
            value={`${gasPct.toFixed(1)}%`}
            hint={`${block.gasUsed.toString()} / ${block.gasLimit.toString()}`}
          />
          <MiniStat
            label="Size"
            value={`${block.size.toString()}`}
            hint="bytes"
          />
          <MiniStat
            label="Validator"
            value={block.miner.slice(0, 6) + "…" + block.miner.slice(-4)}
            hint="block proposer"
          />
        </div>

        <section className="card p-6 sm:p-8">
          <DetailRow label="Block height">
            <span className="font-bold text-text">{block.number?.toString()}</span>
          </DetailRow>
          <DetailRow label="Hash">
            <span className="inline-flex items-center gap-2">
              <span className="mono break-all">{block.hash}</span>
              {block.hash && <CopyButton value={block.hash} />}
            </span>
          </DetailRow>
          <DetailRow label="Parent hash">
            <span className="inline-flex items-center gap-2">
              <HashLink hash={block.parentHash} network={network} type="block" truncate={false} />
              <CopyButton value={block.parentHash} />
            </span>
          </DetailRow>
          <DetailRow label="Validator">
            <span className="inline-flex items-center gap-2">
              <AddressLink address={block.miner} network={network} truncate={false} />
              <CopyButton value={block.miner} />
            </span>
          </DetailRow>
          <DetailRow label="Timestamp">
            <span>
              {new Date(Number(block.timestamp) * 1000).toUTCString()}
              <span className="text-text-muted ml-2">({relativeTime(block.timestamp)})</span>
            </span>
          </DetailRow>
          {block.baseFeePerGas && (
            <DetailRow label="Base fee">
              <span className="mono">{gweiFromWei(block.baseFeePerGas)} gwei</span>
            </DetailRow>
          )}
        </section>

        {blockTxs.length > 0 && (
          <section className="card p-6 sm:p-8 mt-6">
            <h2 className="display text-2xl text-text mb-4">Transactions in this block</h2>
            <ul className="divide-y divide-border">
              {blockTxs.map((t) => (
                <li key={t.hash} className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <HashLink hash={t.hash} network={network} type="tx" />
                    <CopyButton value={t.hash} />
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
