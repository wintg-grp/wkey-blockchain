"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

const TEMPLATES: { id: string; signature: string; selector: string; types: string[]; names: string[] }[] = [
  { id: "transfer",          signature: "transfer(address,uint256)",                                         selector: "0xa9059cbb", types: ["address","uint256"], names: ["to","amount"] },
  { id: "transferFrom",      signature: "transferFrom(address,address,uint256)",                             selector: "0x23b872dd", types: ["address","address","uint256"], names: ["from","to","amount"] },
  { id: "approve",           signature: "approve(address,uint256)",                                          selector: "0x095ea7b3", types: ["address","uint256"], names: ["spender","amount"] },
  { id: "mint",              signature: "mint(address,uint256)",                                             selector: "0x40c10f19", types: ["address","uint256"], names: ["to","amount"] },
  { id: "safeTransferFrom",  signature: "safeTransferFrom(address,address,uint256)",                         selector: "0x42842e0e", types: ["address","address","uint256"], names: ["from","to","tokenId"] },
  { id: "setApprovalForAll", signature: "setApprovalForAll(address,bool)",                                   selector: "0xa22cb465", types: ["address","bool"], names: ["operator","approved"] },
];

function encodeAddress(addr: string): string {
  const a = addr.replace(/^0x/, "").toLowerCase();
  if (a.length !== 40) throw new Error(`Invalid address: ${addr}`);
  return a.padStart(64, "0");
}
function encodeUint(value: string): string {
  const v = BigInt(value);
  if (v < 0n) throw new Error("uint cannot be negative");
  return v.toString(16).padStart(64, "0");
}
function encodeBool(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1") return "0".repeat(63) + "1";
  if (v === "false" || v === "0") return "0".repeat(64);
  throw new Error(`Invalid bool: ${value}`);
}

export default function EncodePage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [tplId, setTplId] = useState(TEMPLATES[0].id);
  const [args, setArgs] = useState<string[]>(Array(TEMPLATES[0].types.length).fill(""));
  const [error, setError] = useState<string | null>(null);

  const tpl = TEMPLATES.find((t) => t.id === tplId)!;

  const encoded = useMemo(() => {
    setError(null);
    if (args.some((a) => a === "")) return "";
    try {
      const parts: string[] = [];
      tpl.types.forEach((t, i) => {
        if (t === "address") parts.push(encodeAddress(args[i]));
        else if (t.startsWith("uint")) parts.push(encodeUint(args[i]));
        else if (t === "bool") parts.push(encodeBool(args[i]));
        else throw new Error(`Type non supporté : ${t}`);
      });
      return tpl.selector + parts.join("");
    } catch (e) {
      setError((e as Error).message);
      return "";
    }
  }, [tpl, args]);

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Encodeur de données d'entrée" : "Input data encoder"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Choisissez une fonction, remplissez les arguments, et obtenez les données calldata prêtes à être envoyées dans une transaction."
            : "Pick a function, fill in the arguments and get the calldata ready to drop into a transaction."}
        </p>

        <form className="card p-6 sm:p-8 mt-10 space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Fonction" : "Function"}
            </label>
            <select
              value={tplId}
              onChange={(e) => {
                setTplId(e.target.value);
                const t = TEMPLATES.find((x) => x.id === e.target.value)!;
                setArgs(Array(t.types.length).fill(""));
              }}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.signature}</option>
              ))}
            </select>
          </div>

          {tpl.types.map((t, i) => (
            <div key={i}>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {tpl.names[i]} <span className="text-text-faint">· {t}</span>
              </label>
              <input
                value={args[i]}
                onChange={(e) => {
                  const next = [...args];
                  next[i] = e.target.value;
                  setArgs(next);
                }}
                placeholder={t === "address" ? "0x…" : t === "bool" ? "true / false" : "0"}
                spellCheck={false}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 mono outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-xl px-4 py-3">{error}</div>
          )}
        </form>

        <section className="card p-6 sm:p-8 mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-text-muted">
                {fr ? "Calldata encodée" : "Encoded calldata"}
              </div>
              <div className="text-xs text-text-faint mt-1">{tpl.signature} → {tpl.selector}</div>
            </div>
            {encoded && <CopyButton value={encoded} />}
          </div>
          <pre className="mono text-xs sm:text-sm break-all whitespace-pre-wrap bg-surface-2 rounded-2xl p-4 min-h-[120px]">
            {encoded || (fr ? "Remplissez les arguments…" : "Fill in the arguments…")}
          </pre>
        </section>
      </div>
    </PageShell>
  );
}
