"use client";

import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

interface LookupResult {
  domain: string;
  resolved: string | null;
  message: string;
}

export default function DomainsPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [query, setQuery] = useState("");
  const [out, setOut] = useState<LookupResult | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    let q = query.trim().toLowerCase();
    if (!q) return;
    if (!q.endsWith(".wtg")) q = `${q}.wtg`;
    setOut({
      domain: q,
      resolved: null,
      message: fr
        ? "Le registre de domaines .wtg est en cours de construction. Le contrat sera publié dans les semaines à venir, et toutes les recherches se feront ici."
        : "The .wtg domain registry is being built. The contract will ship in the coming weeks and every lookup will run from this page.",
    });
  };

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Recherche de domaine" : "Domain name lookup"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Les domaines WINTG se terminent par .wtg. Saisissez un nom — par exemple alice.wtg — pour voir l'adresse, le propriétaire et les enregistrements associés."
            : "WINTG domain names end in .wtg. Enter a name — alice.wtg for example — to see the resolved address, owner and records."}
        </p>

        <form onSubmit={onSubmit} className="card p-4 sm:p-5 mt-10 flex flex-col sm:flex-row gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="alice.wtg"
            spellCheck={false}
            className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors"
          />
          <button type="submit" className="btn-primary justify-center">
            {fr ? "Rechercher" : "Look up"}
          </button>
        </form>

        {out && (
          <section className="card-inverse p-6 sm:p-8 mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
              {fr ? "Domaine" : "Domain"}
            </div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">{out.domain}</div>
            <p className="mt-4 opacity-80 leading-relaxed text-sm">{out.message}</p>
          </section>
        )}

        <section className="card p-6 sm:p-8 mt-10">
          <h2 className="display text-2xl text-text">
            {fr ? "Comment ça marchera" : "How it will work"}
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-text-muted">
            <li>· {fr ? "Un contrat de registre de noms .wtg, publié à l'adresse publique communiquée à la sortie." : "A .wtg name registry contract, published at a public address at launch."}</li>
            <li>· {fr ? "Enregistrement on-chain, transferts, renouvellements." : "On-chain registration, transfers, renewals."}</li>
            <li>· {fr ? "Mappage domaine ↔ adresse, plus enregistrements supplémentaires (avatar, e-mail, social)." : "Domain ↔ address mapping plus additional records (avatar, email, socials)."}</li>
            <li>· {fr ? "Résolution depuis cette page et depuis l'API publique." : "Resolution from this page and from the public API."}</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
