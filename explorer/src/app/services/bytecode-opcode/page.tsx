"use client";

import { useState, useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { CopyButton } from "@/components/Copy";
import { useSettings } from "@/lib/settings";
import { networkFromParam, getClient } from "@/lib/rpc";
import { disassemble, type DisassembledLine } from "@/lib/evm-opcodes";
import { isAddress, type Address } from "viem";

export const dynamic = "force-dynamic";

type Mode = "raw" | "address";

export default function BytecodeOpcodePage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [mode, setMode] = useState<Mode>("raw");
  const [bytecode, setBytecode] = useState("");
  const [address,  setAddress]  = useState("");
  const [lines, setLines] = useState<DisassembledLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Re-run the disassembler whenever the bytecode changes (raw mode).
  useEffect(() => {
    if (mode !== "raw") return;
    if (!bytecode.trim()) { setLines(null); setError(null); return; }
    try {
      setLines(disassemble(bytecode));
      setError(null);
    } catch (err) {
      setLines(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bytecode, mode]);

  async function fetchAddress(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLines(null);
    if (!isAddress(address)) {
      setError(fr ? "Adresse invalide." : "Invalid address.");
      return;
    }
    setLoading(true);
    try {
      const client = getClient(network);
      const code = await client.getBytecode({ address: address as Address });
      if (!code || code === "0x") {
        setError(fr ? "Aucun bytecode à cette adresse (EOA ou contrat self-destruit)." : "No bytecode at this address (EOA or self-destructed contract).");
      } else {
        setBytecode(code);
        setLines(disassemble(code));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell network={network}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Bytecode → Opcode" : "Bytecode → Opcode"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed max-w-2xl">
          {fr
            ? "Désassemble le bytecode runtime d'un contrat EVM en opcodes lisibles. Compatible avec tous les opcodes Cancun-Prague (PUSH0, MCOPY, BLOBHASH, transient storage…)."
            : "Disassemble an EVM contract's runtime bytecode into human-readable opcodes. Covers every Cancun-Prague opcode (PUSH0, MCOPY, BLOBHASH, transient storage…)."}
        </p>

        <div className="card mt-8 p-1 inline-flex gap-1">
          {(["raw", "address"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                mode === m ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {m === "raw"
                ? (fr ? "Bytecode brut" : "Raw bytecode")
                : (fr ? "Depuis une adresse" : "From an address")}
            </button>
          ))}
        </div>

        {mode === "raw" && (
          <div className="card p-6 mt-4 space-y-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted mb-2">
                {fr ? "Bytecode (0x…)" : "Bytecode (0x…)"}
              </div>
              <textarea
                value={bytecode}
                onChange={(e) => setBytecode(e.target.value)}
                rows={8}
                placeholder="0x6080604052…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-xs"
              />
            </label>
          </div>
        )}

        {mode === "address" && (
          <form onSubmit={fetchAddress} className="card p-6 mt-4 space-y-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted mb-2">
                {fr ? "Adresse du contrat" : "Contract address"}
              </div>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </label>
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? (fr ? "Lecture…" : "Reading…") : (fr ? "Récupérer le bytecode" : "Fetch bytecode")}
            </button>
          </form>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 text-rose-600 dark:text-rose-300 p-3 text-sm mt-4">
            {error}
          </div>
        )}

        {lines && lines.length > 0 && (
          <section className="card mt-6 overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="text-sm">
                <span className="text-text font-semibold">
                  {lines.length} {fr ? "opcodes" : "opcodes"}
                </span>
                <span className="text-text-muted ml-3">
                  {fr ? "Taille : " : "Size: "}
                  {bytecode.startsWith("0x") ? (bytecode.length - 2) / 2 : bytecode.length / 2} {fr ? "octets" : "bytes"}
                </span>
              </div>
              {bytecode && <CopyButton value={bytecode} size={14} />}
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs mono">
                <thead className="bg-surface-2 text-text-muted">
                  <tr>
                    <th className="text-left px-4 py-2">PC</th>
                    <th className="text-left px-4 py-2">Opcode</th>
                    <th className="text-left px-4 py-2">Mnemonic</th>
                    <th className="text-left px-4 py-2">{fr ? "Immédiat" : "Immediate"}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-1.5 text-text-muted tabular-nums">{l.pc.toString(16).padStart(4, "0")}</td>
                      <td className="px-4 py-1.5 text-text-muted">0x{l.byte.toString(16).padStart(2, "0")}</td>
                      <td className="px-4 py-1.5 text-text font-semibold">{l.name}</td>
                      <td className="px-4 py-1.5 text-accent break-all">{l.immediate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="card p-6 mt-10 text-sm text-text-muted leading-relaxed">
          <h2 className="display text-2xl text-text mb-3">{fr ? "Comment lire" : "How to read"}</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>{fr ? "PC = offset en hex dans le bytecode." : "PC = hex offset within the bytecode."}</li>
            <li>{fr ? "Les PUSH1..PUSH32 sont suivis de 1 à 32 octets de données immédiates." : "PUSH1..PUSH32 are followed by 1 to 32 bytes of immediate data."}</li>
            <li>{fr ? "Le bytecode runtime se termine généralement par un metadata CBOR — lisible mais pas exécuté." : "Runtime bytecode usually ends with a CBOR metadata blob — readable but not executed."}</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
