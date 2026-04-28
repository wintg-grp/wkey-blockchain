"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

interface NftCollection {
  slug: string;
  name: string;
  symbol: string;
  type: "ERC-721" | "ERC-1155";
  items?: number;
  blurb: { fr: string; en: string };
  cover: string; // tailwind classes for the gradient placeholder
}

const COLLECTIONS: NftCollection[] = [
  // Will populate from the indexer once collections exist on-chain.
];

export default function NftsPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">{fr ? "NFTs" : "NFTs"}</h1>
        <p className="mt-3 text-text-muted max-w-2xl">
          {fr
            ? "Collections ERC-721 et ERC-1155 déployées sur WINTG. Les studios de jeu, les artistes et les marques publient leurs items via la NFT factory publique."
            : "ERC-721 and ERC-1155 collections deployed on WINTG. Game studios, artists and brands ship their items via the public NFT factory."}
        </p>

        {COLLECTIONS.length === 0 ? (
          <section className="card p-12 mt-10 text-center">
            <span className="pill bg-accent/12 text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
              {fr ? "Bientôt" : "Coming soon"}
            </span>
            <h2 className="display text-3xl sm:text-4xl text-text mt-5">
              {fr ? "Pas encore de collections" : "No collections yet"}
            </h2>
            <p className="text-text-muted mt-3 max-w-md mx-auto">
              {fr
                ? "Les premières collections seront listées ici dès leur publication on-chain. Découvrez le guide gaming sur doc.wintg.network pour shipper la vôtre."
                : "The first collections will be listed here as soon as they're published on-chain. See the gaming guide on doc.wintg.network to ship yours."}
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-10">
            {COLLECTIONS.map((c) => (
              <article key={c.slug} className="card overflow-hidden">
                <div className={`aspect-square ${c.cover}`} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-2xl text-text truncate">{c.name}</h3>
                    <span className="pill bg-surface-2 text-text-muted text-[10px]">{c.type}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">{c.symbol}</div>
                  <p className="mt-3 text-xs text-text-muted leading-relaxed line-clamp-2">
                    {fr ? c.blurb.fr : c.blurb.en}
                  </p>
                  {c.items !== undefined && (
                    <div className="mt-3 text-[10px] uppercase tracking-wider text-accent font-bold">
                      {c.items.toLocaleString("fr-FR")} {fr ? "items" : "items"}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </PageShell>
  );
}
