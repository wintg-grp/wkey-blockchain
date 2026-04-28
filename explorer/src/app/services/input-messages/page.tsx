"use client";

import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { CopyButton } from "@/components/Copy";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import {
  isAddress,
  isHex,
  hexToString,
  stringToHex,
  type Hex,
} from "viem";

export const dynamic = "force-dynamic";

type Mode = "send" | "decode";

export default function InputMessagesPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [mode, setMode] = useState<Mode>("send");

  /* ---- Send ---- */
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [valueWtg, setValueWtg] = useState("0");
  const [hex, setHex] = useState<Hex | "">("");
  const [sendError, setSendError] = useState<string | null>(null);

  /* ---- Decode ---- */
  const [decodeInput, setDecodeInput] = useState("");
  const [decoded, setDecoded] = useState<{ text: string; bytes: number } | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  function buildHex(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setHex("");
    try {
      if (to && !isAddress(to)) throw new Error(fr ? "Adresse invalide." : "Invalid address.");
      if (!body)                throw new Error(fr ? "Message requis." : "Message required.");
      const h = stringToHex(body);
      setHex(h);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendViaWallet() {
    setSendError(null);
    try {
      const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error(fr ? "Aucun wallet détecté." : "No wallet detected.");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error(fr ? "Connexion wallet annulée." : "Wallet connection cancelled.");

      const data = isHex(hex) ? hex : stringToHex(body);
      const valueHex = `0x${BigInt(Math.round(parseFloat(valueWtg || "0") * 1e18)).toString(16)}`;

      const params: Record<string, string> = {
        from,
        data,
        value: valueHex,
      };
      if (to) params.to = to;

      const txHash = (await eth.request({
        method: "eth_sendTransaction",
        params: [params],
      })) as string;

      setSendError(null);
      alert((fr ? "Tx envoyée : " : "Tx sent: ") + txHash);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  }

  function onDecode(e: React.FormEvent) {
    e.preventDefault();
    setDecoded(null);
    setDecodeError(null);
    try {
      let h = decodeInput.trim();
      if (!h) throw new Error(fr ? "Input requis." : "Input required.");
      if (!h.startsWith("0x")) h = `0x${h}`;
      if (!isHex(h)) throw new Error(fr ? "Hex invalide." : "Invalid hex.");
      const text = hexToString(h as Hex);
      setDecoded({ text, bytes: (h.length - 2) / 2 });
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Messages d'entrée (IDM)" : "Input Data Messages (IDM)"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Communiquez on-chain en glissant du texte dans le champ data d'une transaction. Le message est encodé en UTF-8 → hex et reste lisible par tout le monde, à jamais."
            : "Communicate on-chain by stuffing text into a transaction's data field. The message is encoded as UTF-8 → hex and remains readable by anyone, forever."}
        </p>

        <div className="card mt-8 p-1 inline-flex gap-1">
          {(["send", "decode"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                mode === m ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {m === "send"
                ? (fr ? "Envoyer" : "Send")
                : (fr ? "Décoder" : "Decode")}
            </button>
          ))}
        </div>

        {mode === "send" && (
          <form onSubmit={buildHex} className="card p-6 mt-4 space-y-4">
            <Field label={fr ? "Destinataire (optionnel)" : "Recipient (optional)"}>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </Field>
            <Field label={fr ? "Valeur (WTG, optionnel)" : "Value (WTG, optional)"}>
              <input
                value={valueWtg}
                onChange={(e) => setValueWtg(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent text-sm"
              />
            </Field>
            <Field label={fr ? "Message" : "Message"}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder={fr ? "Votre message…" : "Your message…"}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent text-sm"
              />
              <div className="text-[11px] text-text-muted mt-1">
                {body.length} {fr ? "caractères" : "chars"} · {new TextEncoder().encode(body).length} {fr ? "octets" : "bytes"}
              </div>
            </Field>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary">{fr ? "Encoder en hex" : "Encode to hex"}</button>
              <button type="button" onClick={sendViaWallet} className="btn-ghost border border-border">
                {fr ? "Envoyer via wallet" : "Send via wallet"}
              </button>
            </div>

            {sendError && (
              <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 text-rose-600 dark:text-rose-300 p-3 text-sm">
                {sendError}
              </div>
            )}

            {hex && (
              <div className="rounded-2xl border border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2">
                  {fr ? "Données encodées" : "Encoded data"}
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="mono break-all">{hex}</span>
                  <CopyButton value={hex} size={14} />
                </div>
                <p className="text-xs opacity-80 mt-3">
                  {fr
                    ? "Collez cette valeur dans le champ « data » de votre wallet, puis envoyez la tx au destinataire de votre choix."
                    : "Paste this into your wallet's « data » field, then send the tx to whichever recipient you like."}
                </p>
              </div>
            )}
          </form>
        )}

        {mode === "decode" && (
          <form onSubmit={onDecode} className="card p-6 mt-4 space-y-4">
            <Field label={fr ? "Input data hex" : "Input data hex"}>
              <textarea
                value={decodeInput}
                onChange={(e) => setDecodeInput(e.target.value)}
                rows={4}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </Field>
            <button type="submit" className="btn-primary">{fr ? "Décoder" : "Decode"}</button>

            {decodeError && (
              <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 text-rose-600 dark:text-rose-300 p-3 text-sm">
                {decodeError}
              </div>
            )}
            {decoded && (
              <div className="rounded-2xl border border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2">
                  {fr ? "Texte décodé" : "Decoded text"} · {decoded.bytes} {fr ? "octets" : "bytes"}
                </div>
                <pre className="text-sm whitespace-pre-wrap break-words">{decoded.text}</pre>
              </div>
            )}
          </form>
        )}

        <section className="card p-6 mt-10">
          <h2 className="display text-2xl text-text mb-3">{fr ? "Cas d'usage" : "Use cases"}</h2>
          <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
            <li>{fr ? "Annoncer un message public horodaté on-chain (déclaration, attestation)." : "Publish a public message timestamped on-chain (declaration, attestation)."}</li>
            <li>{fr ? "Joindre un mémo lisible à un transfert (numéro de facture, référence client)." : "Attach a readable memo to a transfer (invoice number, customer reference)."}</li>
            <li>{fr ? "Coordonner un groupe sans serveur central — chaque message est lisible via son hash de tx." : "Coordinate a group without a central server — every message is readable through its tx hash."}</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted mb-2">{label}</div>
      {children}
    </label>
  );
}
