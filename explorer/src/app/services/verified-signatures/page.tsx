"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { CopyButton } from "@/components/Copy";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import {
  getAddress,
  hashMessage,
  isAddress,
  isHex,
  recoverAddress,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const dynamic = "force-dynamic";

type Mode = "verify" | "sign";

export default function VerifiedSignaturesPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [mode, setMode] = useState<Mode>("verify");

  /* ---- Verify state ---- */
  const [vMessage, setVMessage]     = useState("");
  const [vSignature, setVSignature] = useState("");
  const [vAddress, setVAddress]     = useState("");
  const [vResult, setVResult]       = useState<null | { ok: boolean; recovered?: Address; error?: string }>(null);

  /* ---- Sign state (offline / client-side, with a private key) ---- */
  const [sMessage, setSMessage] = useState("");
  const [sPk, setSPk]           = useState("");
  const [sResult, setSResult]   = useState<null | { signature: Hex; address: Address; messageHash: Hex; error?: string }>(null);

  const messageHash = useMemo(() => {
    try {
      return hashMessage(vMessage);
    } catch {
      return "" as Hex;
    }
  }, [vMessage]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setVResult(null);
    try {
      if (!vMessage)               throw new Error(fr ? "Message requis." : "Message required.");
      if (!isHex(vSignature))      throw new Error(fr ? "Signature invalide (doit être 0x…)." : "Invalid signature (must be 0x…).");
      if (!isAddress(vAddress))    throw new Error(fr ? "Adresse invalide." : "Invalid address.");

      const recovered = await recoverMessageAddress({
        message: vMessage,
        signature: vSignature as Hex,
      });
      const ok = getAddress(recovered) === getAddress(vAddress);
      setVResult({ ok, recovered });
    } catch (err) {
      setVResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function onSign(e: React.FormEvent) {
    e.preventDefault();
    setSResult(null);
    try {
      if (!sMessage) throw new Error(fr ? "Message requis." : "Message required.");
      if (!sPk || !sPk.startsWith("0x") || sPk.length !== 66) {
        throw new Error(fr ? "Clé privée invalide (0x… 64 hex)." : "Invalid private key (0x… 64 hex).");
      }
      const account = privateKeyToAccount(sPk as Hex);
      const signature = await account.signMessage({ message: sMessage });
      const recovered = await recoverAddress({
        hash: hashMessage(sMessage),
        signature,
      });
      setSResult({
        signature,
        address: getAddress(recovered),
        messageHash: hashMessage(sMessage),
      });
    } catch (err) {
      setSResult({ signature: "0x" as Hex, address: "0x" as Address, messageHash: "0x" as Hex, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Signatures vérifiées" : "Verified signatures"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Vérifiez ou produisez une signature de message ECDSA (EIP-191) en utilisant la même crypto que les wallets EVM. Aucune information n'est envoyée au serveur — tout est calculé dans votre navigateur."
            : "Verify or produce an ECDSA message signature (EIP-191) using the same crypto as EVM wallets. Nothing is sent to the server — every operation runs in your browser."}
        </p>

        {/* Mode tabs */}
        <div className="card mt-8 p-1 inline-flex gap-1">
          {(["verify", "sign"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                mode === m
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {m === "verify"
                ? (fr ? "Vérifier" : "Verify")
                : (fr ? "Signer" : "Sign")}
            </button>
          ))}
        </div>

        {mode === "verify" && (
          <form onSubmit={onVerify} className="card p-6 mt-4 space-y-4">
            <Field label={fr ? "Message" : "Message"}>
              <textarea
                value={vMessage}
                onChange={(e) => setVMessage(e.target.value)}
                rows={4}
                placeholder={fr ? "Le message exact qui a été signé" : "The exact message that was signed"}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors text-sm"
              />
            </Field>
            <Field label={fr ? "Signature (0x…)" : "Signature (0x…)"}>
              <input
                value={vSignature}
                onChange={(e) => setVSignature(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </Field>
            <Field label={fr ? "Adresse attendue" : "Expected address"}>
              <input
                value={vAddress}
                onChange={(e) => setVAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </Field>

            {messageHash && (
              <div className="text-xs text-text-muted">
                {fr ? "Hash EIP-191 : " : "EIP-191 hash: "}
                <span className="mono break-all">{messageHash}</span>
              </div>
            )}

            <button type="submit" className="btn-primary">{fr ? "Vérifier" : "Verify"}</button>

            {vResult && (
              <ResultBox
                ok={vResult.ok}
                title={
                  vResult.error
                    ? (fr ? "Erreur" : "Error")
                    : vResult.ok
                      ? (fr ? "Signature valide" : "Valid signature")
                      : (fr ? "Signature invalide" : "Invalid signature")
                }
              >
                {vResult.error ? (
                  <p className="text-sm">{vResult.error}</p>
                ) : (
                  <div className="text-sm space-y-1">
                    <div>
                      {fr ? "Adresse récupérée : " : "Recovered address: "}
                      <span className="mono break-all">{vResult.recovered}</span>
                    </div>
                    <div className="opacity-80">
                      {vResult.ok
                        ? (fr ? "Elle correspond à l'adresse attendue." : "It matches the expected address.")
                        : (fr ? "Elle ne correspond pas à l'adresse attendue." : "It does not match the expected address.")}
                    </div>
                  </div>
                )}
              </ResultBox>
            )}
          </form>
        )}

        {mode === "sign" && (
          <form onSubmit={onSign} className="card p-6 mt-4 space-y-4">
            <div className="rounded-2xl border border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 p-3 text-xs leading-relaxed">
              {fr
                ? "⚠️ Le mode signature s'exécute dans votre navigateur (aucun envoi serveur). Pour les signatures réelles, utilisez plutôt votre wallet (MetaMask, Rabby, Trust). N'utilisez ce mode qu'avec une clé éphémère ou de test."
                : "⚠️ The signing mode runs entirely in your browser (no server roundtrip). For real signatures, use your wallet (MetaMask, Rabby, Trust). Only use this mode with an ephemeral or test key."}
            </div>
            <Field label={fr ? "Message" : "Message"}>
              <textarea
                value={sMessage}
                onChange={(e) => setSMessage(e.target.value)}
                rows={4}
                placeholder={fr ? "Texte à signer" : "Text to sign"}
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent text-sm"
              />
            </Field>
            <Field label={fr ? "Clé privée (0x…)" : "Private key (0x…)"}>
              <input
                value={sPk}
                onChange={(e) => setSPk(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                type="password"
                className="w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent mono text-sm"
              />
            </Field>

            <button type="submit" className="btn-primary">{fr ? "Signer le message" : "Sign message"}</button>

            {sResult && (
              <ResultBox
                ok={!sResult.error}
                title={sResult.error ? (fr ? "Erreur" : "Error") : (fr ? "Signature générée" : "Signature generated")}
              >
                {sResult.error ? (
                  <p className="text-sm">{sResult.error}</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="opacity-80 shrink-0">{fr ? "Adresse :" : "Address:"}</span>
                      <span className="mono break-all">{sResult.address}</span>
                      <CopyButton value={sResult.address} size={14} />
                    </div>
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="opacity-80 shrink-0">{fr ? "Hash EIP-191 :" : "EIP-191 hash:"}</span>
                      <span className="mono break-all">{sResult.messageHash}</span>
                    </div>
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="opacity-80 shrink-0">{fr ? "Signature :" : "Signature:"}</span>
                      <span className="mono break-all">{sResult.signature}</span>
                      <CopyButton value={sResult.signature} size={14} />
                    </div>
                  </div>
                )}
              </ResultBox>
            )}
          </form>
        )}

        <section className="card p-6 mt-10">
          <h2 className="display text-2xl text-text mb-3">{fr ? "À propos d'EIP-191" : "About EIP-191"}</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {fr
              ? "Le standard EIP-191 préfixe le message avec « \\x19Ethereum Signed Message:\\n<length> » avant de hasher en keccak256. Cela évite qu'une signature de message lambda ne soit accidentellement rejouable comme une signature de transaction. WINTG suit ce standard à l'identique."
              : "The EIP-191 standard prepends « \\x19Ethereum Signed Message:\\n<length> » to the message before keccak256-hashing. That prevents an everyday message signature from being accidentally replayable as a transaction signature. WINTG follows the same standard."}
          </p>
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

function ResultBox({
  ok,
  title,
  children,
}: {
  ok: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const tone = ok
    ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-rose-300/60   bg-rose-500/10   text-rose-700   dark:text-rose-300";
  return (
    <div className={`rounded-2xl border ${tone} p-4`}>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2">{title}</div>
      {children}
    </div>
  );
}
