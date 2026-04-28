"use client";

import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

interface CheckResult {
  address: string;
  blockTag: string;
  symbol: string;
  balance: string; // formatted
  raw: string;     // wei
}

export default function BalanceCheckerPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [token, setToken] = useState<"WTG">("WTG");
  const [address, setAddress] = useState("");
  const [blockTag, setBlockTag] = useState<"latest" | "custom">("latest");
  const [customBlock, setCustomBlock] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
      setError(fr ? "Adresse invalide." : "Invalid address.");
      return;
    }
    setLoading(true);
    try {
      const tag = blockTag === "latest" ? "latest" : `0x${parseInt(customBlock || "0", 10).toString(16)}`;
      const body = {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address.trim(), tag],
        id: 1,
      };
      const rpcUrl =
        network === "mainnet"
          ? (process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://rpc.wintg.network")
          : (process.env.NEXT_PUBLIC_TESTNET_RPC ?? "https://testnet-rpc.wintg.network");
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message ?? "RPC error");
      const wei = BigInt(j.result);
      const formatted = formatWtg(wei);
      setResult({
        address: address.trim(),
        blockTag: tag,
        symbol: token,
        balance: formatted,
        raw: wei.toString(),
      });
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Vérification de solde" : "Balance checker"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Saisissez une adresse pour consulter son solde de WTG. Vous pouvez aussi vérifier le solde à un bloc précis du passé."
            : "Enter an address to look up its WTG balance. You can also check the balance at a specific past block."}
        </p>

        <form onSubmit={onSubmit} className="card p-6 sm:p-8 mt-10 space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Token" : "Token"}
            </label>
            <select
              value={token}
              onChange={(e) => setToken(e.target.value as "WTG")}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
            >
              <option value="WTG">WTG · {fr ? "Native" : "Native"}</option>
            </select>
            <p className="mt-1 text-xs text-text-muted">
              {fr
                ? "Les tokens ERC-20 seront ajoutés une fois la liste indexée."
                : "ERC-20 tokens will appear here once the list is indexed."}
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Adresse" : "Address"}
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 mono outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "À quel bloc ?" : "At which block?"}
            </label>
            <div className="mt-1.5 flex gap-2 items-stretch">
              <select
                value={blockTag}
                onChange={(e) => setBlockTag(e.target.value as "latest" | "custom")}
                className="bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
              >
                <option value="latest">{fr ? "Dernier bloc" : "Latest"}</option>
                <option value="custom">{fr ? "Bloc spécifique" : "Specific block"}</option>
              </select>
              {blockTag === "custom" && (
                <input
                  value={customBlock}
                  onChange={(e) => setCustomBlock(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 mono outline-none focus:border-accent transition-colors"
                />
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-xl px-4 py-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center disabled:opacity-60"
          >
            {loading ? (fr ? "Vérification…" : "Checking…") : (fr ? "Vérifier le solde" : "Check balance")}
          </button>
        </form>

        {result && (
          <section className="card-inverse p-6 sm:p-8 mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
              {fr ? "Solde" : "Balance"}
            </div>
            <div className="display text-6xl sm:text-7xl mt-2 leading-none">
              {result.balance}
              <span className="text-3xl ml-2 opacity-70">{result.symbol}</span>
            </div>
            <div className="mt-4 text-xs opacity-70 mono break-all">
              {result.address} · block {result.blockTag} · raw {result.raw} wei
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function formatWtg(wei: bigint): string {
  const ONE = 10n ** 18n;
  const whole = wei / ONE;
  const frac = wei % ONE;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr.slice(0, 6)}` : whole.toString();
}
