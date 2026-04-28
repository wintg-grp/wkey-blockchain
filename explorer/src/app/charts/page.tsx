import { PageShell } from "@/components/PageShell";
import { Sparkline } from "@/components/Sparkline";
import { getClient, networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

const SAMPLE_BLOCKS = 60;

async function loadStats(net: "mainnet" | "testnet") {
  const client = getClient(net);
  const head = await client.getBlockNumber();

  const start = head > BigInt(SAMPLE_BLOCKS) ? head - BigInt(SAMPLE_BLOCKS) : 0n;
  const blocks = await Promise.all(
    Array.from({ length: SAMPLE_BLOCKS }, (_, i) =>
      client
        .getBlock({ blockNumber: start + BigInt(i + 1), includeTransactions: false })
        .catch(() => null),
    ),
  );

  const valid = blocks.filter(Boolean) as NonNullable<(typeof blocks)[number]>[];
  const txPerBlock = valid.map((b) => b.transactions.length);
  const gasPerBlock = valid.map((b) => Number(b.gasUsed));
  const sizePerBlock = valid.map((b) => Number(b.size));

  const validators = new Map<string, number>();
  for (const b of valid) {
    const k = b.miner.toLowerCase();
    validators.set(k, (validators.get(k) ?? 0) + 1);
  }

  const totalTx = txPerBlock.reduce((a, n) => a + n, 0);
  const totalGas = gasPerBlock.reduce((a, n) => a + n, 0);

  return {
    head,
    txPerBlock,
    gasPerBlock,
    sizePerBlock,
    validators: Array.from(validators.entries()),
    totalTx,
    totalGas,
    blocks: valid.length,
  };
}

function StatCard({
  label,
  value,
  hint,
  series,
  variant = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  series?: number[];
  variant?: "default" | "accent" | "inverse";
}) {
  const klass =
    variant === "inverse"
      ? "card-inverse p-6"
      : variant === "accent"
        ? "p-6 rounded-3xl bg-wintg-gradient text-accent-fg"
        : "card p-6";
  return (
    <div className={klass}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${variant === "default" ? "text-text-muted" : "opacity-80"}`}>
        {label}
      </div>
      <div className="display text-4xl sm:text-5xl mt-2 leading-none tracking-tight-display">{value}</div>
      {hint && (
        <div className={`mt-1 text-xs ${variant === "default" ? "text-text-muted" : "opacity-70"}`}>
          {hint}
        </div>
      )}
      {series && (
        <div className="mt-4 -mx-2">
          <Sparkline data={series} width={300} height={48} color="#FF6A1A" />
        </div>
      )}
    </div>
  );
}

export default async function ChartsPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const stats = await loadStats(network);
  const avgTxPerBlock = stats.blocks ? (stats.totalTx / stats.blocks).toFixed(2) : "0";
  const avgGas = stats.blocks ? Math.round(stats.totalGas / stats.blocks) : 0;
  const topValidator = [...stats.validators].sort((a, b) => b[1] - a[1])[0];

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">Charts &amp; stats</h1>
        <p className="mt-3 text-text-muted">
          Réel · échantillon des {stats.blocks} derniers blocs sur {network}.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          <StatCard
            variant="accent"
            label="Latest block"
            value={`#${stats.head.toString()}`}
            hint={network === "mainnet" ? "Chain 2280" : "Chain 22800"}
          />
          <StatCard
            label="Avg tx / block"
            value={avgTxPerBlock}
            hint={`${stats.totalTx} tx in ${stats.blocks} blocks`}
            series={stats.txPerBlock}
          />
          <StatCard
            variant="inverse"
            label="Avg gas / block"
            value={avgGas.toLocaleString("fr-FR")}
            hint={`peak ${Math.max(0, ...stats.gasPerBlock).toLocaleString("fr-FR")}`}
            series={stats.gasPerBlock}
          />
          <StatCard
            label="Avg block size"
            value={`${Math.round(stats.sizePerBlock.reduce((a, n) => a + n, 0) / Math.max(1, stats.blocks)).toLocaleString("fr-FR")}`}
            hint="bytes"
            series={stats.sizePerBlock}
          />
          <StatCard
            label="Active validators"
            value={stats.validators.length}
            hint="seen in this sample"
          />
          <StatCard
            label="Top validator share"
            value={topValidator ? `${Math.round((topValidator[1] / stats.blocks) * 100)}%` : "—"}
            hint={topValidator ? `${topValidator[0].slice(0, 8)}…` : ""}
          />
        </div>

        <section className="card p-6 sm:p-8 mt-8">
          <h2 className="display text-2xl sm:text-3xl text-text mb-4">Validator distribution</h2>
          <ul className="divide-y divide-border">
            {stats.validators.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([addr, count]) => {
              const pct = Math.round((count / stats.blocks) * 100);
              return (
                <li key={addr} className="py-3 grid grid-cols-12 items-center gap-3">
                  <div className="col-span-7 mono text-sm text-text-muted truncate">{addr}</div>
                  <div className="col-span-3">
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-wintg-gradient" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-sm font-semibold">{count} blocks · {pct}%</div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
