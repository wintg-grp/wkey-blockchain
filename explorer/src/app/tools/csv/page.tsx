"use client";

import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

type ExportType = "transactions" | "internal" | "logs" | "tokens";

export default function CsvExportPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [type, setType] = useState<ExportType>("transactions");
  const [address, setAddress] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Export CSV" : "CSV export"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Téléchargez l'historique on-chain d'une adresse pour vos archives, votre comptabilité ou vos analyses. L'export couvre les transactions natives, les transactions internes, les logs et les transferts de tokens."
            : "Download the on-chain history of an address for your archives, accounting or analytics. Exports cover native transactions, internal transactions, logs and token transfers."}
        </p>

        <form onSubmit={onSubmit} className="card p-6 sm:p-8 mt-10 space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Type d'export" : "Export type"}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ExportType)}
              className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
            >
              <option value="transactions">{fr ? "Transactions natives (WTG)" : "Native transactions (WTG)"}</option>
              <option value="internal">    {fr ? "Transactions internes" : "Internal transactions"}</option>
              <option value="logs">        {fr ? "Logs d'événements" : "Event logs"}</option>
              <option value="tokens">      {fr ? "Transferts de tokens (ERC-20)" : "Token transfers (ERC-20)"}</option>
            </select>
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

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Date de début" : "Start date"}
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Date de fin" : "End date"}
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full justify-center">
            {fr ? "Préparer l'export" : "Prepare export"}
          </button>
        </form>

        {submitted && (
          <section className="card-inverse p-6 sm:p-8 mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
              {fr ? "Statut" : "Status"}
            </div>
            <h3 className="display text-3xl mt-2">
              {fr ? "Export en file d'attente" : "Export queued"}
            </h3>
            <p className="mt-3 text-sm opacity-80 leading-relaxed">
              {fr
                ? "L'export sera généré côté serveur dès que l'indexeur sera publié (couplage à la DB en cours). Tu recevras un lien de téléchargement par email à l'adresse fournie dans tes préférences."
                : "The export will be generated server-side once the indexer ships (DB hookup in progress). You'll receive a download link to the email registered in your preferences."}
            </p>
            <div className="mt-4 mono text-xs opacity-70">
              type: {type} · address: {address || "—"} · range: {from || "—"} → {to}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
