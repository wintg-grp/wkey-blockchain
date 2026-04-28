import { notFound } from "next/navigation";
import Link from "next/link";
import { getAddress } from "viem";
import { PageShell } from "@/components/PageShell";
import { DetailRow } from "@/components/DetailRow";
import { CopyButton } from "@/components/Copy";
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
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10 w-full">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text">{isContract ? "Contract" : "Address"}</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-4 mb-6">
          <h1 className="display text-5xl sm:text-7xl text-text">
            {isContract ? "Contract" : "Address"}
          </h1>
          <span
            className={`pill ${
              isContract
                ? "bg-purple-500/15 text-purple-600"
                : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isContract ? "bg-purple-500" : "bg-emerald-500"}`} />
            {isContract ? "Smart contract" : "EOA wallet"}
          </span>
        </div>

        <section className="card p-6 sm:p-8">
          <DetailRow label="Address">
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span className="mono break-all">{checksummed}</span>
              <CopyButton value={checksummed} />
            </span>
          </DetailRow>
          <DetailRow label="Balance">
            <span className="text-text font-bold text-xl">{formatWtg(balance)} WTG</span>
          </DetailRow>
          <DetailRow label="Nonce">
            <span className="mono">{nonce}</span>
            <span className="text-text-muted ml-2">
              ({nonce === 0 ? "no outgoing transactions" : `${nonce} outgoing transactions`})
            </span>
          </DetailRow>
          {isContract && code && (
            <DetailRow label="Bytecode">
              <details className="cursor-pointer">
                <summary className="text-text-muted hover:text-text">
                  Show bytecode ({Math.floor((code.length - 2) / 2)} bytes)
                </summary>
                <pre className="mono text-xs bg-surface-2 p-3 rounded-xl overflow-x-auto break-all whitespace-pre-wrap mt-2 max-h-64">
                  {code}
                </pre>
              </details>
            </DetailRow>
          )}
        </section>

        <section className="card p-6 sm:p-8 mt-6">
          <h2 className="display text-2xl text-text mb-3">
            {isContract ? "Contract" : "Recent activity"}
          </h2>
          {isContract ? (
            <p className="text-sm text-text-muted">
              Source verification will be available in a later release. The bytecode above
              can be cross-referenced with the public deployment manifest at{" "}
              <a
                href="https://github.com/wintg-grp/wkey-blockchain/tree/main/contracts/deployments"
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
              >
                github.com/wintg-grp/wkey-blockchain
              </a>
              .
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              Transaction history is being indexed. In the meantime, search a transaction
              hash from your wallet to view its details.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
