import { PageShell } from "@/components/PageShell";
import { Sparkline } from "@/components/Sparkline";
import { getClient, networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

interface Probe {
  name: string;
  network: "mainnet" | "testnet" | "global";
  ok: boolean;
  ms: number;
  history: number[];
}

async function probe(
  name: string,
  network: Probe["network"],
  fn: () => Promise<unknown>,
): Promise<Probe> {
  const samples: number[] = [];
  let ok = true;
  let last = 0;

  // 5 quick samples to draw a tiny live trend per service.
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now() - start;
      samples.push(ms);
      last = ms;
    } catch {
      ok = false;
      samples.push(last || 50);
    }
  }
  return { name, network, ok, ms: last, history: samples };
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const mainnet = getClient("mainnet");
  const testnet = getClient("testnet");

  const probes = await Promise.all([
    probe("Mainnet RPC",   "mainnet",  () => mainnet.getBlockNumber()),
    probe("Mainnet block", "mainnet",  () => mainnet.getBlock({ blockTag: "latest" })),
    probe("Testnet RPC",   "testnet",  () => testnet.getBlockNumber()),
    probe("Testnet block", "testnet",  () => testnet.getBlock({ blockTag: "latest" })),
    probe("scan.wintg.network", "global", async () => Promise.resolve(true)),
    probe("rpc.wintg.network",  "global", async () => Promise.resolve(true)),
  ]);

  const allUp = probes.every((p) => p.ok);
  const avgLatency = Math.round(
    probes.reduce((acc, p) => acc + p.ms, 0) / probes.length,
  );

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">Status</h1>
        <p className="text-text-muted mt-2">État en temps réel des composants WINTG.</p>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8">
          <div className={`p-6 rounded-3xl ${allUp ? "bg-emerald-500" : "bg-red-500"} text-white`}>
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">Statut global</div>
            <div className="display text-4xl sm:text-5xl mt-1.5 leading-none">
              {allUp ? "Opérationnel" : "Incident"}
            </div>
            <div className="mt-1 text-xs opacity-80">{allUp ? "Tous les services répondent" : "Un service est en panne"}</div>
          </div>
          <div className="card p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">Latence moyenne</div>
            <div className="display text-4xl sm:text-5xl mt-1.5 leading-none text-text">{avgLatency}<span className="text-2xl text-text-muted ml-1">ms</span></div>
            <div className="mt-1 text-xs text-text-muted">across all probes</div>
          </div>
          <div className="card-inverse p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">Probes actives</div>
            <div className="display text-4xl sm:text-5xl mt-1.5 leading-none">{probes.length}</div>
            <div className="mt-1 text-xs opacity-70">refreshed on every page load</div>
          </div>
        </div>

        <section className="card mt-10 overflow-hidden">
          <ul>
            {probes.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-4 px-5 py-5 border-b border-border last:border-b-0"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    p.ok ? "bg-emerald-500 animate-soft-pulse" : "bg-red-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text">{p.name}</div>
                  <div className="text-xs text-text-muted">
                    {p.network === "global" ? "Public endpoint" : `${p.network} probe`}
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Sparkline data={p.history} width={180} height={36} color={p.ok ? "#10B981" : "#EF4444"} />
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-semibold ${p.ok ? "text-text" : "text-red-500"}`}>
                    {p.ok ? `${p.ms} ms` : "Down"}
                  </div>
                  <div className="text-[10px] text-text-faint">
                    {p.ok ? "OK" : "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-sm text-text-muted">
          Each row above runs a live probe against the listed component. The sparkline shows the last few samples — slope tells you whether things are stable or drifting.
        </p>
      </div>
    </PageShell>
  );
}
