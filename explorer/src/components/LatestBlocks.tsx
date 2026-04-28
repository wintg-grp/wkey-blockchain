import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";
import { HashLink } from "./AddressLink";
import { relativeTime } from "@/lib/format";
import Link from "next/link";

const COUNT = 8;

export async function LatestBlocks({ network }: { network: NetworkKey }) {
  const client = getClient(network);
  const head = await client.getBlockNumber();

  const numbers = Array.from({ length: COUNT }, (_, i) => head - BigInt(i));
  const blocks = await Promise.all(
    numbers.map((n) => client.getBlock({ blockNumber: n }).catch(() => null)),
  );

  return (
    <section className="card p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-white text-base">Latest blocks</h2>
        <Link
          href={`/?net=${network}`}
          className="text-xs text-ink-300 hover:text-wintg-500 transition-colors"
        >
          View all
        </Link>
      </header>
      <ul className="divide-y divide-ink-800/60">
        {blocks.filter(Boolean).map((b) => {
          if (!b) return null;
          return (
            <li
              key={b.hash}
              className="py-3 flex items-center gap-4 hover:bg-ink-800/30 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="grid place-items-center w-10 h-10 rounded-lg bg-ink-800 text-wintg-500 font-bold text-xs">
                #{(b.number ?? 0n).toString().slice(-3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">
                  <Link
                    href={`/block/${b.number?.toString()}?net=${network}`}
                    className="hover:text-wintg-500 transition-colors"
                  >
                    Block {b.number?.toString()}
                  </Link>
                </div>
                <div className="text-xs text-ink-400 mt-0.5">
                  {b.transactions.length} tx · validator{" "}
                  <HashLink hash={b.miner} network={network} type="block" />
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-300">{relativeTime(b.timestamp)}</div>
                <div className="text-[10px] text-ink-500 mono mt-0.5">
                  {b.gasUsed.toString()}/{b.gasLimit.toString()}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
