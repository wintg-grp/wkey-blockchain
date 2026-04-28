import { PageShell } from "@/components/PageShell";
import { Sparkline } from "@/components/Sparkline";
import { getClient, networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

const SAMPLE_BLOCKS = 60;

function gweiOf(wei: bigint | undefined | null): number {
  if (wei === undefined || wei === null) return 0;
  return Number(wei) / 1e9;
}

async function loadGas(net: "mainnet" | "testnet") {
  const client = getClient(net);
  const head = await client.getBlock({ blockTag: "latest" });
  const start = head.number > BigInt(SAMPLE_BLOCKS) ? head.number - BigInt(SAMPLE_BLOCKS) : 0n;

  const blocks = await Promise.all(
    Array.from({ length: SAMPLE_BLOCKS }, (_, i) =>
      client
        .getBlock({ blockNumber: start + BigInt(i + 1), includeTransactions: false })
        .catch(() => null),
    ),
  );
  const valid = blocks.filter(Boolean) as NonNullable<(typeof blocks)[number]>[];

  const baseFees = valid.map((b) => gweiOf(b.baseFeePerGas));
  const utilizations = valid.map((b) => Number(b.gasUsed) / Number(b.gasLimit));

  const min = Math.min(...baseFees);
  const max = Math.max(...baseFees);
  const avg = baseFees.reduce((a, n) => a + n, 0) / Math.max(1, baseFees.length);

  const currentGas = await client.getGasPrice().catch(() => 0n);
  const slow = avg * 0.95;
  const standard = avg;
  const fast = avg * 1.15;

  return { head, baseFees, utilizations, min, max, avg, currentGas, slow, standard, fast };
}

function GasCard({
  label,
  gwei,
  hint,
  variant = "default",
}: {
  label: string;
  gwei: number;
  hint?: string;
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
      <div className="display text-5xl sm:text-6xl mt-2 leading-none tracking-tight-display">
        {gwei.toFixed(2)}
        <span className="text-2xl ml-2 opacity-70">gwei</span>
      </div>
      {hint && (
        <div className={`mt-1 text-xs ${variant === "default" ? "text-text-muted" : "opacity-70"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default async function GasTrackerPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const data = await loadGas(network);

  // Heatmap: utilization% bucketed across the sample window
  const cols = 24;
  const heat: number[] = Array(cols).fill(0);
  data.utilizations.forEach((u, i) => {
    const idx = Math.floor((i / data.utilizations.length) * cols);
    heat[idx] = Math.max(heat[idx], u);
  });

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">Gas tracker</h1>
        <p className="mt-3 text-text-muted">
          Real-time gas pricing on {network} · sample of last {data.baseFees.length} blocks.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          <GasCard label="Slow"     gwei={data.slow}     hint="≈ 5 % below average" />
          <GasCard variant="accent" label="Standard" gwei={data.standard} hint="recent average" />
          <GasCard variant="inverse" label="Fast"     gwei={data.fast}     hint="≈ 15 % above average" />
        </div>

        <section className="card p-6 sm:p-8 mt-8">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="display text-3xl text-text">Base fee</h2>
              <p className="text-sm text-text-muted mt-1">
                low {data.min.toFixed(2)} · avg {data.avg.toFixed(2)} · high {data.max.toFixed(2)} gwei
              </p>
            </div>
            <span className="pill bg-accent/12 text-accent">live</span>
          </div>
          <Sparkline data={data.baseFees} width={1100} height={140} color="#FF6A1A" />
        </section>

        <section className="card p-6 sm:p-8 mt-6">
          <h2 className="display text-3xl text-text mb-3">Block utilisation heatmap</h2>
          <p className="text-sm text-text-muted mb-5">
            {data.utilizations.length} blocs récents, regroupés en {cols} cellules. Plus la cellule
            est saturée, plus les blocs étaient pleins.
          </p>
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1">
            {heat.map((u, i) => {
              const intensity = Math.min(1, u);
              const bg = `rgba(255,106,26,${0.10 + intensity * 0.85})`;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-lg border border-border"
                  style={{ backgroundColor: bg }}
                  title={`${(intensity * 100).toFixed(0)} % full`}
                />
              );
            })}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
