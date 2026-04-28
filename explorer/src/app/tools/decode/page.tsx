"use client";

import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

type Mode = "tx-input" | "raw" | "log";

interface DecodedField {
  name: string;
  type: string;
  value: string;
}

interface DecodeOutput {
  source: string;
  selector?: string;
  signature?: string;
  fields: DecodedField[];
  rawHex: string;
}

// A small built-in catalogue of known signatures. Decoder stays useful even
// when the contract isn't verified yet — covers the most common ERC-20 / 721
// methods people encounter on a fresh chain.
const SIGNATURES: Record<string, { signature: string; types: string[]; names: string[] }> = {
  "0xa9059cbb": { signature: "transfer(address,uint256)",                                  types: ["address","uint256"],         names: ["to","amount"] },
  "0x23b872dd": { signature: "transferFrom(address,address,uint256)",                      types: ["address","address","uint256"], names: ["from","to","amount"] },
  "0x095ea7b3": { signature: "approve(address,uint256)",                                   types: ["address","uint256"],         names: ["spender","amount"] },
  "0x40c10f19": { signature: "mint(address,uint256)",                                      types: ["address","uint256"],         names: ["to","amount"] },
  "0x42842e0e": { signature: "safeTransferFrom(address,address,uint256)",                  types: ["address","address","uint256"], names: ["from","to","tokenId"] },
  "0xb88d4fde": { signature: "safeTransferFrom(address,address,uint256,bytes)",            types: ["address","address","uint256","bytes"], names: ["from","to","tokenId","data"] },
  "0xa22cb465": { signature: "setApprovalForAll(address,bool)",                            types: ["address","bool"],            names: ["operator","approved"] },
  "0x70a08231": { signature: "balanceOf(address)",                                         types: ["address"],                   names: ["owner"] },
  "0x06fdde03": { signature: "name()",                                                     types: [],                            names: [] },
  "0x95d89b41": { signature: "symbol()",                                                   types: [],                            names: [] },
  "0x18160ddd": { signature: "totalSupply()",                                              types: [],                            names: [] },
};

function decodeAddress(hex: string): string {
  return "0x" + hex.slice(-40).toLowerCase();
}
function decodeUint(hex: string): string {
  return BigInt("0x" + hex).toString();
}
function decodeBool(hex: string): string {
  return BigInt("0x" + hex) === 0n ? "false" : "true";
}

function decodeArgs(types: string[], data: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (const t of types) {
    const slot = data.slice(i * 64, (i + 1) * 64);
    if (t === "address") out.push(decodeAddress(slot));
    else if (t.startsWith("uint") || t.startsWith("int")) out.push(decodeUint(slot));
    else if (t === "bool") out.push(decodeBool(slot));
    else out.push("0x" + slot);
    i++;
  }
  return out;
}

function decodeRaw(rawIn: string): DecodeOutput | string {
  let raw = rawIn.trim();
  if (raw.startsWith("0x")) raw = raw.slice(2);
  if (raw.length < 8) return "Input is too short to be a function call.";
  const selector = "0x" + raw.slice(0, 8);
  const args = raw.slice(8);

  const sig = SIGNATURES[selector];
  if (!sig) {
    return {
      source: "raw",
      selector,
      fields: [
        { name: "selector", type: "bytes4", value: selector },
        { name: "args (raw)", type: "bytes", value: "0x" + args },
      ],
      rawHex: "0x" + raw,
    };
  }
  const decoded = decodeArgs(sig.types, args);
  return {
    source: "raw",
    selector,
    signature: sig.signature,
    fields: sig.types.map((t, i) => ({ name: sig.names[i], type: t, value: decoded[i] })),
    rawHex: "0x" + raw,
  };
}

export default function DecodePage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [mode, setMode] = useState<Mode>("tx-input");
  const [target, setTarget] = useState("");
  const [raw, setRaw] = useState("");
  const [out, setOut] = useState<DecodeOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOut(null);
    setLoading(true);
    try {
      let inputHex = raw;
      if (mode === "tx-input") {
        const hash = target.trim();
        if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error(fr ? "Hash de transaction invalide." : "Invalid tx hash.");
        const rpcUrl =
          network === "mainnet"
            ? (process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://rpc.wintg.network")
            : (process.env.NEXT_PUBLIC_TESTNET_RPC ?? "https://testnet-rpc.wintg.network");
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionByHash", params: [hash], id: 1 }),
        });
        const j = await res.json();
        if (!j.result) throw new Error(fr ? "Transaction introuvable." : "Transaction not found.");
        inputHex = j.result.input ?? "0x";
        if (inputHex === "0x") throw new Error(fr ? "Cette transaction n'a pas de données d'entrée." : "This transaction has no input data.");
      }
      const decoded = decodeRaw(inputHex);
      if (typeof decoded === "string") throw new Error(decoded);
      setOut(decoded);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Décodeur de données d'entrée" : "Input data decoder"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Décodez les données envoyées dans une transaction WINTG. Collez un hash de transaction et nous récupérerons l'input automatiquement, ou collez directement le bytecode hexadécimal."
            : "Decode the data sent in a WINTG transaction. Paste a tx hash and we'll fetch the input for you, or paste the raw hex bytecode directly."}
        </p>

        <form onSubmit={onSubmit} className="card p-6 sm:p-8 mt-10 space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Source" : "Source"}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 p-1 bg-surface-2 border border-border rounded-2xl">
              <button
                type="button"
                onClick={() => setMode("tx-input")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  mode === "tx-input" ? "bg-accent text-accent-fg shadow-flat" : "text-text-muted"
                }`}
              >
                {fr ? "Hash de transaction" : "Transaction hash"}
              </button>
              <button
                type="button"
                onClick={() => setMode("raw")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  mode === "raw" ? "bg-accent text-accent-fg shadow-flat" : "text-text-muted"
                }`}
              >
                {fr ? "Hex brut" : "Raw hex"}
              </button>
            </div>
          </div>

          {mode === "tx-input" ? (
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Hash de transaction" : "Transaction hash"}
              </label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 mono outline-none focus:border-accent transition-colors"
              />
            </div>
          ) : (
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Données hex" : "Hex data"}
              </label>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="0xa9059cbb…"
                rows={5}
                spellCheck={false}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 mono text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-xl px-4 py-3">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
            {loading ? (fr ? "Décodage…" : "Decoding…") : (fr ? "Décoder" : "Decode")}
          </button>
        </form>

        {out && (
          <section className="card p-6 sm:p-8 mt-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="pill bg-accent/12 text-accent">{out.selector}</span>
              {out.signature && (
                <span className="font-display text-2xl text-text">{out.signature}</span>
              )}
            </div>
            <ul className="mt-5 divide-y divide-border">
              {out.fields.map((f, i) => (
                <li key={i} className="py-3 grid grid-cols-12 items-start gap-3">
                  <div className="col-span-3 sm:col-span-2 text-text-muted text-xs uppercase tracking-wider">
                    <div>{f.name || `arg ${i}`}</div>
                    <div className="text-text-faint">{f.type}</div>
                  </div>
                  <div className="col-span-8 sm:col-span-9 mono text-sm break-all">{f.value}</div>
                  <div className="col-span-1 text-right">
                    <CopyButton value={f.value} size={14} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider font-bold text-text-muted mb-1">Raw</div>
              <div className="mono text-xs text-text-muted break-all">{out.rawHex}</div>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
