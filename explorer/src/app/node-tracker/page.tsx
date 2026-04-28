import { PageShell } from "@/components/PageShell";
import { getClient, networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

const SAMPLE_BLOCKS = 60;

async function nodeProbe(net: "mainnet" | "testnet") {
  const client = getClient(net);
  const head = await client.getBlock({ blockTag: "latest" });
  const start = head.number > BigInt(SAMPLE_BLOCKS) ? head.number - BigInt(SAMPLE_BLOCKS) : 0n;
  const blocks = await Promise.all(
    Array.from({ length: SAMPLE_BLOCKS }, (_, i) =>
      client.getBlock({ blockNumber: start + BigInt(i + 1) }).catch(() => null),
    ),
  );
  const valid = blocks.filter(Boolean) as NonNullable<(typeof blocks)[number]>[];

  const validators = new Map<string, { count: number; lastSeen: number }>();
  for (const b of valid) {
    const k = b.miner.toLowerCase();
    const cur = validators.get(k);
    if (cur) {
      cur.count += 1;
      cur.lastSeen = Math.max(cur.lastSeen, Number(b.timestamp));
    } else {
      validators.set(k, { count: 1, lastSeen: Number(b.timestamp) });
    }
  }
  return {
    head,
    sample: valid.length,
    validators: Array.from(validators.entries())
      .map(([address, { count, lastSeen }]) => ({ address, count, lastSeen }))
      .sort((a, b) => b.count - a.count),
  };
}

export default async function NodeTrackerPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const data = await nodeProbe(network);

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">Node tracker</h1>
        <p className="mt-3 text-text-muted">
          Validators seen producing blocks on {network} over the last {data.sample} blocks.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-10">
          <div className="rounded-3xl bg-wintg-gradient text-accent-fg p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">Latest block</div>
            <div className="display text-4xl mt-2 leading-none">#{data.head.number?.toString()}</div>
          </div>
          <div className="card p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">Active validators</div>
            <div className="display text-4xl mt-2 leading-none">{data.validators.length}</div>
          </div>
          <div className="card-inverse p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">Sampled blocks</div>
            <div className="display text-4xl mt-2 leading-none">{data.sample}</div>
          </div>
          <div className="card p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">Top share</div>
            <div className="display text-4xl mt-2 leading-none">
              {data.validators[0] ? `${Math.round((data.validators[0].count / data.sample) * 100)}%` : "—"}
            </div>
          </div>
        </div>

        <section className="card mt-10 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-text-muted border-b border-border">
            <div className="col-span-1">#</div>
            <div className="col-span-6">Validator</div>
            <div className="col-span-3">Blocks</div>
            <div className="col-span-2 text-right">Last seen</div>
          </div>
          <ul>
            {data.validators.map((v, i) => {
              const pct = (v.count / data.sample) * 100;
              const ago = Math.max(0, Math.floor(Date.now() / 1000) - v.lastSeen);
              return (
                <li
                  key={v.address}
                  className="grid grid-cols-12 gap-2 px-5 py-4 items-center border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
                >
                  <div className="col-span-1 text-text-muted">{i + 1}</div>
                  <div className="col-span-6 mono text-sm text-text break-all">{v.address}</div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{v.count}</div>
                      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-wintg-gradient" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-text-muted w-10 text-right">{Math.round(pct)}%</div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-sm text-text-muted">
                    {ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
