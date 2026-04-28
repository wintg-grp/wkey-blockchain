import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { HashLink } from "@/components/AddressLink";
import { CopyButton } from "@/components/Copy";
import { StatTile } from "@/components/StatTile";
import { StatCluster } from "@/components/StatCluster";
import { getClient, networkFromParam } from "@/lib/rpc";
import { relativeTime } from "@/lib/format";

export const revalidate = 0;
const PER_PAGE = 50;

const MiniStat = StatTile;

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: { net?: string; from?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const client = getClient(network);
  const head = await client.getBlockNumber();

  const fromParam = searchParams.from
    ? BigInt(parseInt(searchParams.from, 10))
    : head;
  const start = fromParam > BigInt(PER_PAGE - 1) ? fromParam - BigInt(PER_PAGE - 1) : 0n;

  const numbers: bigint[] = [];
  for (let n = fromParam; n >= start; n--) numbers.push(n);

  const blocks = await Promise.all(
    numbers.map((n) => client.getBlock({ blockNumber: n }).catch(() => null)),
  );

  const olderFrom = start > 0n ? start - 1n : null;
  const newerFrom = fromParam < head ? fromParam + BigInt(PER_PAGE) : null;
  const newerCapped = newerFrom !== null ? (newerFrom > head ? head : newerFrom) : null;

  const validBlocks = blocks.filter(Boolean) as NonNullable<(typeof blocks)[number]>[];
  const totalTx = validBlocks.reduce((acc, b) => acc + b.transactions.length, 0);
  const avgGas = validBlocks.length
    ? Math.round(validBlocks.reduce((a, b) => a + Number(b.gasUsed), 0) / validBlocks.length)
    : 0;
  const validators = new Set(validBlocks.map((b) => b.miner.toLowerCase()));

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-5xl sm:text-7xl text-text">Blocks</h1>
        <p className="text-text-muted mt-2">
          Live block production on {network} · {head.toString()} blocks total.
        </p>

        <div className="mt-8">
          <StatCluster>
            <MiniStat variant="accent" label="Latest height" value={`#${head.toString()}`} hint={network === "mainnet" ? "Chain 2280" : "Chain 22800"} />
            <MiniStat label="Tx in this page" value={totalTx} hint={`across ${validBlocks.length} blocks`} />
            <MiniStat label="Avg gas used" value={avgGas.toLocaleString("fr-FR")} hint="per block" />
            <MiniStat variant="inverse" label="Active validators" value={validators.size} hint="seen in this page" />
          </StatCluster>
        </div>

        <section className="card mt-8 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div className="col-span-2">Height</div>
            <div className="col-span-3">Hash</div>
            <div className="col-span-3">Validator</div>
            <div className="col-span-1 text-right">Tx</div>
            <div className="col-span-3 text-right">When</div>
          </div>
          <ul>
            {validBlocks.map((b) => (
              <li
                key={b.hash}
                className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <div className="col-span-2 font-bold text-text">
                  <Link href={`/block/${b.number}?net=${network}`} className="hover:text-accent">
                    #{b.number?.toString()}
                  </Link>
                </div>
                <div className="col-span-3 inline-flex items-center gap-1">
                  <HashLink hash={b.hash} network={network} type="block" />
                  <CopyButton value={b.hash} size={14} />
                </div>
                <div className="col-span-3">
                  <HashLink hash={b.miner} network={network} type="block" />
                </div>
                <div className="col-span-1 text-right text-text-muted">{b.transactions.length}</div>
                <div className="col-span-3 text-right text-text-muted text-sm">
                  {relativeTime(b.timestamp)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-between mt-6">
          <Link
            href={newerCapped !== null ? `/blocks?net=${network}&from=${newerCapped}` : `/blocks?net=${network}`}
            className={`btn-ghost ${newerCapped === null ? "opacity-50 pointer-events-none" : ""}`}
          >
            ← Newer
          </Link>
          <Link
            href={olderFrom !== null ? `/blocks?net=${network}&from=${olderFrom}` : `#`}
            className={`btn-ghost ${olderFrom === null ? "opacity-50 pointer-events-none" : ""}`}
          >
            Older →
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
