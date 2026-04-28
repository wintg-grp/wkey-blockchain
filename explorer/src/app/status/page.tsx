import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { getClient, networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

async function probe(name: string, fn: () => Promise<unknown>) {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start };
  } catch {
    return { name, ok: false, ms: Date.now() - start };
  }
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const mainnet = getClient("mainnet");
  const testnet = getClient("testnet");

  const checks = await Promise.all([
    probe("Mainnet RPC", () => mainnet.getBlockNumber()),
    probe("Mainnet WS",  () => mainnet.getBlockNumber()),
    probe("Testnet RPC", () => testnet.getBlockNumber()),
    probe("Testnet WS",  () => testnet.getBlockNumber()),
    probe("scan.wintg.network", async () => true),
  ]);

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <h1 className="display text-5xl sm:text-7xl text-text">Status</h1>
        <p className="text-text-muted mt-2">Real-time state of the WINTG components.</p>

        <ul className="mt-10 divide-y divide-border card overflow-hidden">
          {checks.map((c) => (
            <li key={c.name} className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    c.ok ? "bg-emerald-500 animate-soft-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-text font-semibold">{c.name}</span>
              </div>
              <span className={`text-sm ${c.ok ? "text-text-muted" : "text-red-500 font-bold"}`}>
                {c.ok ? `OK · ${c.ms}ms` : "Down"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 text-sm text-text-muted">
          For incidents, see the <Link href="/contact" className="link-accent">contact page</Link>.
        </div>
      </div>
    </PageShell>
  );
}
