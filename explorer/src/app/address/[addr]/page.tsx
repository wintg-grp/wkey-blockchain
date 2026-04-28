import { notFound } from "next/navigation";
import Link from "next/link";
import { getAddress } from "viem";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DetailRow } from "@/components/DetailRow";
import { getClient, networkFromParam } from "@/lib/rpc";
import { formatWtg, isAddress } from "@/lib/format";

export const revalidate = 0;

export default async function AddressPage({
  params,
  searchParams,
}: {
  params: { addr: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  if (!isAddress(params.addr)) notFound();

  const checksummed = getAddress(params.addr);
  const client = getClient(network);

  const [balance, nonce, code] = await Promise.all([
    client.getBalance({ address: checksummed }),
    client.getTransactionCount({ address: checksummed }),
    client.getCode({ address: checksummed }).catch(() => undefined),
  ]);

  const isContract = code !== undefined && code !== "0x" && code !== "0x0";

  return (
    <div className="min-h-screen flex flex-col">
      <Header network={network} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-ink-300 mb-4">
          <Link href={`/?net=${network}`} className="hover:text-white">Home</Link>
          <span className="mx-2 text-ink-500">/</span>
          <span className="text-white">{isContract ? "Contract" : "Address"}</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {isContract ? "Contract" : "Address"}
          </h1>
          <span
            className={`pill ${
              isContract
                ? "bg-purple-500/15 text-purple-400"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isContract ? "bg-purple-400" : "bg-emerald-400"}`} />
            {isContract ? "Smart contract" : "EOA wallet"}
          </span>
        </div>

        <section className="card p-6">
          <DetailRow label="Address" copyable={checksummed}>
            <span className="mono break-all">{checksummed}</span>
          </DetailRow>
          <DetailRow label="Balance">
            <span className="text-white font-bold text-xl">{formatWtg(balance)} WTG</span>
          </DetailRow>
          <DetailRow label="Nonce">
            <span className="mono">{nonce}</span>
            <span className="text-ink-400 ml-2">
              ({nonce === 0 ? "no outgoing transactions" : `${nonce} outgoing transactions`})
            </span>
          </DetailRow>
          {isContract && code && (
            <DetailRow label="Bytecode">
              <details className="cursor-pointer">
                <summary className="text-ink-300 hover:text-white">
                  Show bytecode ({Math.floor((code.length - 2) / 2)} bytes)
                </summary>
                <pre className="mono text-xs bg-ink-900 p-3 rounded-lg overflow-x-auto break-all whitespace-pre-wrap mt-2 max-h-64">
                  {code}
                </pre>
              </details>
            </DetailRow>
          )}
        </section>

        {isContract && (
          <section className="card p-6 mt-6">
            <h2 className="font-bold text-white text-lg mb-3">Contract</h2>
            <p className="text-sm text-ink-300">
              Source verification will be available in a later release. For now, the
              bytecode above can be cross-referenced with the public deployment manifest at{" "}
              <a
                href="https://github.com/wintg-grp/wkey-blockchain/tree/main/contracts/deployments"
                target="_blank"
                rel="noopener noreferrer"
                className="link-orange"
              >
                github.com/wintg-grp/wkey-blockchain
              </a>
              .
            </p>
          </section>
        )}

        {!isContract && (
          <section className="card p-6 mt-6">
            <h2 className="font-bold text-white text-lg mb-3">Recent activity</h2>
            <p className="text-sm text-ink-300">
              Transaction history is being indexed. In the meantime, search for a specific
              transaction hash from your wallet to view its details here.
            </p>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
