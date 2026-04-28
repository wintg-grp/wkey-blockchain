"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CopyButton } from "@/components/Copy";
import { useSettings } from "@/lib/settings";
import { networkFromParam, getClient } from "@/lib/rpc";
import {
  isAddress,
  parseAbiItem,
  formatUnits,
  encodeFunctionData,
  type Address,
  type Log,
} from "viem";

export const dynamic = "force-dynamic";

const APPROVAL_EVENT = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);

const ERC20_META_ABI = [
  { type: "function", name: "symbol",   stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8"   }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

interface ApprovalRow {
  token: Address;
  spender: Address;
  symbol: string;
  decimals: number;
  /** current on-chain allowance (re-checked, not just last event value) */
  allowance: bigint;
  /** last event tx for context */
  lastTxHash: `0x${string}`;
  lastBlock: bigint;
}

const MAX_BLOCK_RANGE = 5000n;
const SCAN_BLOCKS = 100_000n;

export default function TokenApprovalsPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [owner, setOwner] = useState("");
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRows(null);
    setProgress(0);

    if (!isAddress(owner)) {
      setError(fr ? "Adresse invalide." : "Invalid address.");
      return;
    }

    setLoading(true);
    try {
      const client = getClient(network);
      const head = await client.getBlockNumber();
      const fromBlock = head > SCAN_BLOCKS ? head - SCAN_BLOCKS : 0n;

      // Topic-filtered Approval logs across the recent window.
      // We page in MAX_BLOCK_RANGE chunks because some RPC providers limit
      // log queries to a few thousand blocks.
      const ownerAddr = owner as Address;
      const ownerTopic = ("0x" + "0".repeat(24) + ownerAddr.slice(2).toLowerCase()) as `0x${string}`;

      const allLogs: Log[] = [];
      let cursor = fromBlock;
      const total = head - fromBlock + 1n;
      while (cursor <= head) {
        const end = cursor + MAX_BLOCK_RANGE > head ? head : cursor + MAX_BLOCK_RANGE;
        const logs = await client.getLogs({
          event: APPROVAL_EVENT,
          fromBlock: cursor,
          toBlock: end,
          args: { owner: ownerAddr },
        });
        allLogs.push(...(logs as Log[]));
        cursor = end + 1n;
        const done = Number(((end - fromBlock + 1n) * 100n) / total);
        setProgress(Math.min(99, done));
      }

      // Latest event per (token, spender) pair.
      const latest = new Map<string, { token: Address; spender: Address; tx: `0x${string}`; block: bigint }>();
      for (const l of allLogs) {
        // viem decodes args when `event` is provided.
        // l.args is { owner, spender, value }.
        const args = (l as unknown as { args: { spender: Address }; address: Address; transactionHash: `0x${string}`; blockNumber: bigint }).args;
        const token = (l as unknown as { address: Address }).address;
        const spender = args.spender;
        const key = `${token.toLowerCase()}::${spender.toLowerCase()}`;
        const block = (l as unknown as { blockNumber: bigint }).blockNumber;
        const tx    = (l as unknown as { transactionHash: `0x${string}` }).transactionHash;
        const prev = latest.get(key);
        if (!prev || prev.block < block) {
          latest.set(key, { token, spender, tx, block });
        }
      }

      // For each pair, re-read the live allowance (some events may have been
      // overridden, or `decreaseAllowance` calls don't emit a fresh event in
      // every implementation).
      const out: ApprovalRow[] = [];
      for (const { token, spender, tx, block } of latest.values()) {
        try {
          const [symbol, decimals, allowance] = await Promise.all([
            client.readContract({ address: token, abi: ERC20_META_ABI, functionName: "symbol"   }).catch(() => "ERC20"),
            client.readContract({ address: token, abi: ERC20_META_ABI, functionName: "decimals" }).catch(() => 18),
            client.readContract({
              address: token,
              abi: ERC20_META_ABI,
              functionName: "allowance",
              args: [ownerAddr, spender],
            }) as Promise<bigint>,
          ]);
          if (allowance > 0n) {
            out.push({
              token,
              spender,
              symbol: symbol as string,
              decimals: decimals as number,
              allowance,
              lastTxHash: tx,
              lastBlock: block,
            });
          }
        } catch {
          // ignore unreadable token contracts
        }
      }

      setRows(out.sort((a, b) => Number(b.lastBlock - a.lastBlock)));
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function revoke(row: ApprovalRow) {
    try {
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error(fr ? "Aucun wallet détecté." : "No wallet detected.");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) return;

      const data = encodeFunctionData({
        abi: [{
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
          outputs: [{ type: "bool" }],
        }],
        functionName: "approve",
        args: [row.spender, 0n],
      });

      await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: row.token, data }],
      });
      alert(fr ? "Révocation envoyée. Re-scannez après confirmation." : "Revoke tx sent. Re-scan after confirmation.");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <PageShell network={network}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Approbations de tokens" : "Token approvals"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed max-w-2xl">
          {fr
            ? "Listez les approbations ERC-20 actives accordées par votre adresse, et révoquez celles dont vous n'avez plus besoin. Le scan inspecte les 100 000 derniers blocs (~28 h sur WINTG) — étendez la fenêtre via la console si besoin."
            : "List the active ERC-20 approvals granted from your address and revoke the ones you don't need anymore. The scan inspects the last 100 000 blocks (~28 h on WINTG) — extend the window via the console if needed."}
        </p>

        <form onSubmit={onScan} className="card p-4 sm:p-5 mt-8 flex flex-col sm:flex-row gap-2">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="0x… (your address)"
            spellCheck={false}
            className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
          />
          <button type="submit" disabled={loading} className="btn-primary justify-center disabled:opacity-60">
            {loading ? `${progress}%` : (fr ? "Scanner" : "Scan")}
          </button>
        </form>

        {error && (
          <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 text-rose-600 dark:text-rose-300 p-3 text-sm mt-4">
            {error}
          </div>
        )}

        {rows && rows.length === 0 && (
          <section className="card p-8 mt-6 text-center">
            <h2 className="display text-2xl text-text">{fr ? "Aucune approbation active" : "No active approvals"}</h2>
            <p className="text-sm text-text-muted mt-2">
              {fr
                ? "Cette adresse n'a aucune approbation positive sur les 100 000 derniers blocs."
                : "This address has no positive approval over the last 100 000 blocks."}
            </p>
          </section>
        )}

        {rows && rows.length > 0 && (
          <section className="card mt-6 overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm text-text font-semibold">
                {rows.length} {fr ? "approbations actives" : "active approvals"}
              </span>
              <span className="text-xs text-text-muted">
                {fr ? "Données on-chain — lecture pure via RPC" : "On-chain data — read-only via RPC"}
              </span>
            </header>
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const infinite = r.allowance > 2n ** 250n;
                const display = infinite
                  ? "∞"
                  : Number(formatUnits(r.allowance, r.decimals)).toLocaleString("fr-FR", { maximumFractionDigits: 6 });

                return (
                  <li key={`${r.token}-${r.spender}`} className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
                    <div className="min-w-[120px]">
                      <div className="font-semibold text-text">{r.symbol}</div>
                      <Link href={`/address/${r.token}?net=${network}`} className="text-[11px] text-text-muted mono break-all hover:text-accent">
                        {r.token}
                      </Link>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        {fr ? "Spender" : "Spender"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/address/${r.spender}?net=${network}`} className="link-accent mono text-sm break-all">
                          {r.spender}
                        </Link>
                        <CopyButton value={r.spender} size={12} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        {fr ? "Plafond" : "Allowance"}
                      </div>
                      <div className={`text-sm font-semibold ${infinite ? "text-rose-500" : "text-text"}`}>
                        {display} {!infinite && r.symbol}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(r)}
                      className="btn-ghost border border-border text-sm"
                    >
                      {fr ? "Révoquer" : "Revoke"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="card p-6 mt-10 text-sm text-text-muted leading-relaxed">
          <h2 className="display text-2xl text-text mb-3">{fr ? "Comment ça marche" : "How this works"}</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>{fr ? "Le scan utilise eth_getLogs filtré sur la signature de l'event Approval(address,address,uint256)." : "The scan uses eth_getLogs filtered on the Approval(address,address,uint256) event signature."}</li>
            <li>{fr ? "Pour chaque paire (token, spender), Scan relit l'allowance courante via la fonction allowance() — un évènement obsolète ne fait pas de faux positif." : "For each (token, spender) pair, Scan re-reads the current allowance via allowance() — a stale event doesn't show as a false positive."}</li>
            <li>{fr ? "La révocation appelle approve(spender, 0) sur le contrat token via votre wallet (MetaMask, Rabby, Trust)." : "Revoke calls approve(spender, 0) on the token contract through your wallet (MetaMask, Rabby, Trust)."}</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
