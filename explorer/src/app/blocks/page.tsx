import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { HashLink } from "@/components/AddressLink";
import { getClient, networkFromParam } from "@/lib/rpc";
import { relativeTime } from "@/lib/format";

export const revalidate = 0;
const PER_PAGE = 50;

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

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-5xl sm:text-7xl text-text">Blocks</h1>
        <p className="text-text-muted mt-2">
          {head.toString()} blocks produced on {network}.
        </p>

        <section className="card mt-8 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div className="col-span-2">Height</div>
            <div className="col-span-3">Hash</div>
            <div className="col-span-3">Validator</div>
            <div className="col-span-1 text-right">Tx</div>
            <div className="col-span-3 text-right">When</div>
          </div>
          <ul>
            {blocks.filter(Boolean).map((b) => {
              if (!b) return null;
              return (
                <li
                  key={b.hash}
                  className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
                >
                  <div className="col-span-2 font-bold text-text">
                    <Link href={`/block/${b.number}?net=${network}`} className="hover:text-accent">
                      #{b.number?.toString()}
                    </Link>
                  </div>
                  <div className="col-span-3">
                    <HashLink hash={b.hash} network={network} type="block" />
                  </div>
                  <div className="col-span-3">
                    <HashLink hash={b.miner} network={network} type="block" />
                  </div>
                  <div className="col-span-1 text-right text-text-muted">{b.transactions.length}</div>
                  <div className="col-span-3 text-right text-text-muted text-sm">
                    {relativeTime(b.timestamp)}
                  </div>
                </li>
              );
            })}
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
