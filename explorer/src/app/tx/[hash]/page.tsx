import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DetailRow } from "@/components/DetailRow";
import { AddressLink, HashLink } from "@/components/AddressLink";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, gweiFromWei, relativeTime } from "@/lib/format";
import { isTxHash } from "@/lib/format";

export const revalidate = 0;

export default async function TxPage({
  params,
  searchParams,
}: {
  params: { hash: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  if (!isTxHash(params.hash)) notFound();

  const client = getClient(network);
  const hash = params.hash as `0x${string}`;

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }).catch(() => null),
    client.getTransactionReceipt({ hash }).catch(() => null),
  ]);
  if (!tx) notFound();

  const success = receipt?.status === "success";
  const block = await client.getBlock({ blockNumber: tx.blockNumber }).catch(() => null);
  const fee = receipt ? receipt.gasUsed * receipt.effectiveGasPrice : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header network={network} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-ink-300 mb-4">
          <Link href={`/?net=${network}`} className="hover:text-white">Home</Link>
          <span className="mx-2 text-ink-500">/</span>
          <span className="text-white">Transaction</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Transaction
          </h1>
          {receipt && (
            <span
              className={`pill ${
                success ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${success ? "bg-emerald-400" : "bg-red-400"}`} />
              {success ? "Success" : "Reverted"}
            </span>
          )}
          {!receipt && (
            <span className="pill bg-yellow-500/15 text-yellow-300">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Pending
            </span>
          )}
        </div>

        <section className="card p-6">
          <DetailRow label="Transaction hash" copyable={tx.hash}>
            <span className="mono break-all">{tx.hash}</span>
          </DetailRow>
          <DetailRow label="Block">
            {tx.blockNumber !== null && (
              <Link href={`/block/${tx.blockNumber}?net=${network}`} className="link-orange">
                #{tx.blockNumber.toString()}
              </Link>
            )}
            {block && (
              <span className="text-ink-400 ml-2">({relativeTime(block.timestamp)})</span>
            )}
          </DetailRow>
          <DetailRow label="From">
            <AddressLink address={tx.from} network={network} truncate={false} />
          </DetailRow>
          <DetailRow label="To">
            {tx.to ? (
              <AddressLink address={tx.to} network={network} truncate={false} />
            ) : (
              <span className="text-ink-400 italic">Contract creation</span>
            )}
            {receipt?.contractAddress && (
              <div className="mt-1 text-xs text-ink-300">
                Created contract:{" "}
                <AddressLink
                  address={receipt.contractAddress}
                  network={network}
                  truncate={false}
                />
              </div>
            )}
          </DetailRow>
          <DetailRow label="Value">
            <span className="text-white font-bold">{formatWtg(tx.value)} WTG</span>
          </DetailRow>
          {fee !== null && (
            <DetailRow label="Transaction fee">
              <span className="mono">{formatWtg(fee)} WTG</span>
              <span className="text-ink-400 ml-2">
                ({receipt?.gasUsed.toString()} gas × {gweiFromWei(receipt!.effectiveGasPrice)} gwei)
              </span>
            </DetailRow>
          )}
          <DetailRow label="Gas limit">
            <span className="mono">{tx.gas.toString()}</span>
          </DetailRow>
          <DetailRow label="Nonce">
            <span className="mono">{tx.nonce}</span>
          </DetailRow>
          {tx.input && tx.input !== "0x" && (
            <DetailRow label="Input data">
              <pre className="mono text-xs bg-ink-900 p-3 rounded-lg overflow-x-auto break-all whitespace-pre-wrap">
                {tx.input}
              </pre>
            </DetailRow>
          )}
        </section>

        {receipt && receipt.logs.length > 0 && (
          <section className="card p-6 mt-6">
            <h2 className="font-bold text-white text-lg mb-3">
              Logs ({receipt.logs.length})
            </h2>
            <ul className="space-y-3">
              {receipt.logs.map((log, i) => (
                <li key={i} className="bg-ink-900/60 rounded-lg p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="pill bg-wintg-500/15 text-wintg-500">log #{i}</span>
                    <AddressLink address={log.address} network={network} />
                  </div>
                  {log.topics.map((t, j) => (
                    <div key={j} className="mono break-all text-ink-300">
                      <span className="text-ink-500">topic[{j}]:</span> {t}
                    </div>
                  ))}
                  {log.data !== "0x" && (
                    <div className="mono break-all text-ink-300 mt-1">
                      <span className="text-ink-500">data:</span> {log.data}
                    </div>
                  )}
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
