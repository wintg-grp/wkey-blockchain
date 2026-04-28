import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { DetailRow } from "@/components/DetailRow";
import { AddressLink } from "@/components/AddressLink";
import { CopyButton } from "@/components/Copy";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, gweiFromWei, isTxHash, relativeTime } from "@/lib/format";

export const revalidate = 0;

function MiniStat({
  label,
  value,
  hint,
  variant = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  variant?: "default" | "accent" | "inverse";
}) {
  const klass =
    variant === "inverse"
      ? "card-inverse p-5"
      : variant === "accent"
        ? "p-5 rounded-3xl bg-wintg-gradient text-accent-fg"
        : "card p-5";
  return (
    <div className={klass}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${variant === "default" ? "text-text-muted" : "opacity-80"}`}>
        {label}
      </div>
      <div className="mt-1.5 font-display text-2xl sm:text-3xl leading-none tracking-tight-display">
        {value}
      </div>
      {hint && (
        <div className={`mt-1 text-xs ${variant === "default" ? "text-text-muted" : "opacity-70"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

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
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <Link href={`/txs?net=${network}`} className="hover:text-text">Transactions</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text mono">{hash.slice(0, 10)}…</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-4 mb-6">
          <h1 className="display text-5xl sm:text-7xl text-text">Transaction</h1>
          {receipt ? (
            <span
              className={`pill ${
                success ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${success ? "bg-emerald-500" : "bg-red-500"}`} />
              {success ? "Success" : "Reverted"}
            </span>
          ) : (
            <span className="pill bg-yellow-500/15 text-yellow-700">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-soft-pulse" />
              Pending
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <MiniStat variant="accent" label="Value" value={formatWtg(tx.value)} hint="WTG" />
          <MiniStat label="Fee" value={fee ? formatWtg(fee) : "—"} hint="WTG" />
          <MiniStat
            label="Gas used"
            value={receipt ? receipt.gasUsed.toString() : "—"}
            hint={receipt ? `× ${gweiFromWei(receipt.effectiveGasPrice)} gwei` : ""}
          />
          <MiniStat
            variant="inverse"
            label="Block"
            value={tx.blockNumber !== null ? `#${tx.blockNumber}` : "pending"}
            hint={block ? relativeTime(block.timestamp) : ""}
          />
        </div>

        <section className="card p-6 sm:p-8">
          <DetailRow label="Transaction hash">
            <span className="inline-flex items-center gap-2">
              <span className="mono break-all">{tx.hash}</span>
              <CopyButton value={tx.hash} />
            </span>
          </DetailRow>
          <DetailRow label="Block">
            {tx.blockNumber !== null && (
              <Link href={`/block/${tx.blockNumber}?net=${network}`} className="link-accent">
                #{tx.blockNumber.toString()}
              </Link>
            )}
            {block && (
              <span className="text-text-muted ml-2">({relativeTime(block.timestamp)})</span>
            )}
          </DetailRow>
          <DetailRow label="From">
            <span className="inline-flex items-center gap-2 flex-wrap">
              <AddressLink address={tx.from} network={network} truncate={false} />
              <CopyButton value={tx.from} />
            </span>
          </DetailRow>
          <DetailRow label="To">
            {tx.to ? (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <AddressLink address={tx.to} network={network} truncate={false} />
                <CopyButton value={tx.to} />
              </span>
            ) : (
              <span className="text-text-faint italic">Contract creation</span>
            )}
            {receipt?.contractAddress && (
              <div className="mt-1 text-xs text-text-muted inline-flex items-center gap-2 flex-wrap">
                Created contract:{" "}
                <AddressLink address={receipt.contractAddress} network={network} truncate={false} />
                <CopyButton value={receipt.contractAddress} />
              </div>
            )}
          </DetailRow>
          <DetailRow label="Value">
            <span className="text-text font-bold">{formatWtg(tx.value)} WTG</span>
          </DetailRow>
          {fee !== null && (
            <DetailRow label="Transaction fee">
              <span className="mono">{formatWtg(fee)} WTG</span>
              <span className="text-text-muted ml-2">
                ({receipt?.gasUsed.toString()} gas × {gweiFromWei(receipt!.effectiveGasPrice)} gwei)
              </span>
            </DetailRow>
          )}
          <DetailRow label="Nonce">
            <span className="mono">{tx.nonce}</span>
          </DetailRow>
          {tx.input && tx.input !== "0x" && (
            <DetailRow label="Input data">
              <pre className="mono text-xs bg-surface-2 p-3 rounded-xl overflow-x-auto break-all whitespace-pre-wrap">
                {tx.input}
              </pre>
            </DetailRow>
          )}
        </section>

        {receipt && receipt.logs.length > 0 && (
          <section className="card p-6 sm:p-8 mt-6">
            <h2 className="display text-2xl text-text mb-4">Logs ({receipt.logs.length})</h2>
            <ul className="space-y-3">
              {receipt.logs.map((log, i) => (
                <li key={i} className="bg-surface-2 rounded-xl p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="pill bg-accent/12 text-accent">log #{i}</span>
                    <AddressLink address={log.address} network={network} />
                    <CopyButton value={log.address} size={14} />
                  </div>
                  {log.topics.map((topic, j) => (
                    <div key={j} className="mono break-all text-text-muted">
                      <span className="text-text-faint">topic[{j}]:</span> {topic}
                    </div>
                  ))}
                  {log.data !== "0x" && (
                    <div className="mono break-all text-text-muted mt-1">
                      <span className="text-text-faint">data:</span> {log.data}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
