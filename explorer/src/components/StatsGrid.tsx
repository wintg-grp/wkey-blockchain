import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";

async function loadStats(net: NetworkKey) {
  const client = getClient(net);
  const [blockNumber, gasPrice] = await Promise.all([
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);

  // Compute average block time over the last 60 blocks (rough estimate)
  let avgBlockTime: number | null = null;
  try {
    const head = await client.getBlock({ blockNumber });
    if (blockNumber > 60n) {
      const past = await client.getBlock({ blockNumber: blockNumber - 60n });
      avgBlockTime = (Number(head.timestamp) - Number(past.timestamp)) / 60;
    }
  } catch {
    // ignore — fallback below
  }

  return { blockNumber, gasPrice, avgBlockTime };
}

function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card ${accent ? "border-wintg-500/40 shadow-glow" : ""} p-5`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300 font-semibold">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent ? "text-wintg-500" : "text-white"}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export async function StatsGrid({ network }: { network: NetworkKey }) {
  const stats = await loadStats(network);
  const gweiPrice = Number(stats.gasPrice) / 1e9;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        accent
        label="Latest block"
        value={`#${stats.blockNumber.toString()}`}
        hint={`Chain ${network === "mainnet" ? "2280" : "22800"}`}
      />
      <StatCard
        label="Block time"
        value={stats.avgBlockTime ? `${stats.avgBlockTime.toFixed(2)} s` : "—"}
        hint="Average over 60 blocks"
      />
      <StatCard
        label="Gas price"
        value={`${gweiPrice.toFixed(2)} gwei`}
        hint="Current minimum"
      />
      <StatCard
        label="Native asset"
        value="WTG"
        hint="Wrapped: WWTG"
      />
    </div>
  );
}
