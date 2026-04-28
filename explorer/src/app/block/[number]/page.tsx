import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
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
    block = await client.getBlock({
      blockNumber: num,
      includeTransactions: true,
    });
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
    <div className="min-h-screen flex flex-col">
      <Header network={network} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-ink-300 mb-4">
          <Link href={`/?net=${network}`} className="hover:text-white">Home</Link>
          <span className="mx-2 text-ink-500">/</span>
          <span className="text-white">Block {block.number?.toString()}</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-3 mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Block <span className="text-wintg-500">#{block.number?.toString()}</span>
          </h1>
          <span className="text-sm text-ink-300">{relativeTime(block.timestamp)}</span>
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={`/block/${(block.number ?? 0n) - 1n}?net=${network}`}
              className="px-3 py-1.5 text-sm rounded-lg bg-ink-800 hover:bg-ink-700 transition-colors"
            >
              ← Prev
            </Link>
            <Link
              href={`/block/${(block.number ?? 0n) + 1n}?net=${network}`}
              className="px-3 py-1.5 text-sm rounded-lg bg-ink-800 hover:bg-ink-700 transition-colors"
            >
              Next →
            </Link>
          </span>
        </div>

        <section className="card p-6">
          <DetailRow label="Block height" copyable={block.number?.toString()}>
            <span className="font-bold text-white">{block.number?.toString()}</span>
          </DetailRow>
          <DetailRow label="Hash" copyable={block.hash ?? ""}>
            <span className="mono break-all">{block.hash}</span>
          </DetailRow>
          <DetailRow label="Parent hash">
            <HashLink hash={block.parentHash} network={network} type="block" truncate={false} />
          </DetailRow>
          <DetailRow label="Validator (miner)">
            <AddressLink address={block.miner} network={network} truncate={false} />
          </DetailRow>
          <DetailRow label="Timestamp">
            <span>
              {new Date(Number(block.timestamp) * 1000).toUTCString()}
              <span className="text-ink-400 ml-2">({relativeTime(block.timestamp)})</span>
            </span>
          </DetailRow>
          <DetailRow label="Transactions">
            <span className="font-bold text-white">{block.transactions.length}</span>
            <span className="text-ink-300 ml-2">
              · {formatWtg(totalWtg)} WTG transferred
            </span>
          </DetailRow>
          <DetailRow label="Gas used">
            <span className="mono">{block.gasUsed.toString()}</span>
            <span className="text-ink-400 ml-2">/ {block.gasLimit.toString()}</span>
            <span className="ml-2 text-ink-300">
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

        {block.transactions.length > 0 && (
          <section className="card p-6 mt-6">
            <h2 className="font-bold text-white text-lg mb-3">
              Transactions in this block
            </h2>
            <ul className="divide-y divide-ink-800/60">
              {blockTxs.map((t) => (
                <li key={t.hash} className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <HashLink hash={t.hash} network={network} type="tx" />
                    <span className="ml-auto text-sm text-white font-medium">
                      {formatWtg(t.value)} WTG
                    </span>
                  </div>
                  <div className="text-xs text-ink-300 flex flex-wrap items-center gap-x-3">
                    <AddressLink address={t.from} network={network} />
                    <span className="text-ink-500">→</span>
                    {t.to ? (
                      <AddressLink address={t.to} network={network} />
                    ) : (
                      <span className="text-ink-400 italic">contract creation</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
