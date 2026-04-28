import { getClient } from "@/lib/rpc";
import type { NetworkKey } from "@/lib/networks";
import { StatTile } from "./StatTile";
import { PriceTile } from "./PriceTile";
import { StatCluster } from "./StatCluster";
import { DICTS, type Lang } from "@/lib/i18n/dict";

async function loadStats(net: NetworkKey) {
  const client = getClient(net);
  const [blockNumber, gasPrice] = await Promise.all([
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);

  // Approximate "tx in last 24 h" by sampling the most recent ~120 blocks
  // and extrapolating. With 1 s blocks, exact 24 h sampling would be too
  // expensive; this gives a representative number for the homepage tile.
  let recentTxRate = 0;
  try {
    const SAMPLE = 120n;
    const start = blockNumber > SAMPLE ? blockNumber - SAMPLE : 0n;
    const blocks = await Promise.all(
      Array.from({ length: Number(SAMPLE) }, (_, i) =>
        client.getBlock({ blockNumber: start + BigInt(i + 1), includeTransactions: false }).catch(() => null),
      ),
    );
    const totalTx = blocks.reduce((acc, b) => acc + (b?.transactions.length ?? 0), 0);
    const elapsed = blocks.length > 0 ? Math.max(1, Number(SAMPLE)) : 1;
    // tx/sec from sample, projected to 24 h
    recentTxRate = Math.round((totalTx / elapsed) * 86400);
  } catch {
    // ignore
  }

  return { blockNumber, gasPrice, recentTxRate };
}

export async function StatsRow({ network, lang }: { network: NetworkKey; lang: Lang }) {
  const stats = await loadStats(network);
  const t = DICTS[lang];
  const gwei = Number(stats.gasPrice) / 1e9;

  return (
    <StatCluster>
      <PriceTile />
      <StatTile
        label={t.home.statBlock}
        value={`#${stats.blockNumber.toString()}`}
        hint={network === "mainnet" ? "Mainnet · 2280" : "Testnet · 22800"}
      />
      <StatTile
        variant="inverse"
        label={t.home.statTxCount}
        value={stats.recentTxRate.toLocaleString("fr-FR")}
        hint="≈ projected daily volume"
      />
      <StatTile
        variant="accent"
        label={t.home.statGas}
        value={`${gwei.toFixed(2)}`}
        hint="gwei · current minimum"
      />
    </StatCluster>
  );
}
