"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/PageShell";
import { CopyButton } from "@/components/Copy";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import {
  lookupDomain,
  getRegistryAddress,
  type DomainRecord,
} from "@/lib/domain-registry";

export const dynamic = "force-dynamic";

interface LookupResult {
  domain: string;
  record: DomainRecord | null;
  /** true if the registry contract is deployed on this network. */
  deployed: boolean;
}

export default function DomainsPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [query, setQuery] = useState("");
  const [out, setOut] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registryAddr = getRegistryAddress(network);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await lookupDomain(network, query);
      setOut({
        domain: `${res.name}.wtg`,
        record: res.record,
        deployed: res.deployed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOut(null);
    } finally {
      setLoading(false);
    }
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
            className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 outline-none focus:border-accent transition-colors mono"
          />
          <button type="submit" disabled={loading} className="btn-primary justify-center disabled:opacity-60">
            {loading ? (fr ? "Recherche…" : "Looking up…") : (fr ? "Rechercher" : "Look up")}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-300/60 bg-rose-500/10 text-rose-600 dark:text-rose-300 p-4 text-sm">
            {error}
          </div>
        )}

        {out && !out.deployed && (
          <section className="card-inverse p-6 sm:p-8 mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
              {fr ? "Domaine" : "Domain"}
            </div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">{out.domain}</div>
            <p className="mt-4 opacity-80 leading-relaxed text-sm">
              {fr
                ? "Le contrat WtgDomainRegistry n'est pas encore déployé sur ce réseau. Toute recherche se fera ici dès la mise en ligne — l'adresse du contrat sera publiée sur cette page."
                : "The WtgDomainRegistry contract isn't deployed on this network yet. Every lookup will run from this page once it ships — the contract address will be published here."}
            </p>
          </section>
        )}

        {out && out.deployed && !out.record && (
          <section className="card p-6 sm:p-8 mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Disponible" : "Available"}
            </div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none text-text">{out.domain}</div>
            <p className="mt-3 text-sm text-text-muted">
              {fr
                ? "Ce nom n'est pas enregistré ou son enregistrement a expiré. Il peut être réservé via la fonction register() du contrat de registry."
                : "This name isn't registered or its registration has expired. It can be claimed through the registry's register() function."}
            </p>
          </section>
        )}

        {out && out.record && (
          <section className="card p-6 sm:p-8 mt-6 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent">
                {fr ? "Domaine enregistré" : "Registered domain"}
              </div>
              <div className="display text-4xl sm:text-5xl mt-2 leading-none text-text">{out.domain}</div>
            </div>

            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row
                label={fr ? "Adresse résolue" : "Resolved address"}
                value={out.record.resolved}
                isAddress
                network={network}
              />
              <Row
                label={fr ? "Propriétaire" : "Owner"}
                value={out.record.owner}
                isAddress
                network={network}
              />
              <Row
                label={fr ? "Expire le" : "Expires"}
                value={new Date(out.record.expiresAt * 1000).toLocaleDateString(fr ? "fr-FR" : "en-US")}
              />
              <Row
                label={fr ? "Note" : "Text record"}
                value={out.record.text || "—"}
              />
            </dl>
          </section>
        )}

        <section className="card p-6 sm:p-8 mt-10">
          <h2 className="display text-2xl text-text">
            {fr ? "Comment ça marche" : "How it works"}
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-text-muted">
            <li>· {fr ? "Le contrat WtgDomainRegistry stocke chaque nom on-chain (propriétaire, adresse résolue, expiration, texte libre)." : "The WtgDomainRegistry contract stores every name on-chain (owner, resolved address, expiration, free text)."}</li>
            <li>· {fr ? "Enregistrement pour 1 an, renouvelable jusqu'à 5 ans en avance via la fonction renew()." : "Registration lasts 1 year, renewable up to 5 years ahead via the renew() function."}</li>
            <li>· {fr ? "Caractères autorisés : a-z, 0-9, '-' ; longueur 3 à 32 ; pas de tiret en début/fin ni de double tiret." : "Allowed characters: a-z, 0-9, '-'; length 3 to 32; no leading/trailing hyphen, no double hyphen."}</li>
            <li>· {fr ? "Frais d'enregistrement payés en WTG natifs et envoyés au treasury WINTG." : "Registration fees are paid in native WTG and routed to the WINTG treasury."}</li>
            <li>· {fr ? "Résolution lecture pure : exposée par cette page et par l'API publique." : "Read-only resolution: exposed by this page and by the public API."}</li>
          </ul>

          {registryAddr && (
            <div className="mt-5 inline-flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-text-muted">
                {fr ? "Contrat de registry" : "Registry contract"}
              </span>
              <Link href={`/address/${registryAddr}?net=${network}`} className="link-accent mono text-sm break-all">
                {registryAddr}
              </Link>
              <CopyButton value={registryAddr} size={14} />
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Row({
  label,
  value,
  isAddress,
  network,
}: {
  label: string;
  value: string;
  isAddress?: boolean;
  network?: string;
}) {
  return (
    <div className="border-b border-border pb-3 flex items-start gap-3">
      <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0 w-32">{label}</dt>
      <dd className="text-sm text-text break-all flex items-center gap-2 min-w-0">
        {isAddress && value && value !== "0x0000000000000000000000000000000000000000" ? (
          <>
            <Link
              href={`/address/${value}?net=${network}`}
              className="link-accent mono text-sm break-all"
            >
              {value}
            </Link>
            <CopyButton value={value} size={14} />
          </>
        ) : (
          <span className="mono">{value}</span>
        )}
      </dd>
    </div>
  );
}

