"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { VerifiedBadge, type VerifiedTone } from "@/components/VerifiedBadge";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { formatPriceFromWtg } from "@/lib/price";

export const dynamic = "force-dynamic";

interface NftCollection {
  slug: string;
  name: string;
  symbol: string;
  type: "ERC-721" | "ERC-1155";
  items: number;
  floorWtg: number;
  ownerCount: number;
  /** WINTG verification tier */
  verified: VerifiedTone;
  blurb: { fr: string; en: string };
  cover: string; // tailwind classes for the gradient placeholder
}

const COLLECTIONS: NftCollection[] = [
  {
    slug: "wintg-genesis",
    name: "WINTG Genesis",
    symbol: "WGEN",
    type: "ERC-721",
    items: 1000,
    floorWtg: 250,
    ownerCount: 412,
    verified: "gold",
    blurb: {
      fr: "Première collection officielle WINTG. 1 000 pièces de fondation distribuées aux premiers contributeurs et validateurs.",
      en: "The first official WINTG collection. 1 000 founding pieces distributed to early contributors and validators.",
    },
    cover: "bg-gradient-to-br from-orange-400 via-rose-400 to-amber-300",
  },
  {
    slug: "uemoa-builders",
    name: "UEMOA Builders",
    symbol: "UBUI",
    type: "ERC-721",
    items: 250,
    floorWtg: 80,
    ownerCount: 138,
    verified: "blue",
    blurb: {
      fr: "Carte de membre on-chain pour les builders de l'écosystème UEMOA. Donne accès aux ateliers WINTG.",
      en: "On-chain membership card for builders in the UEMOA ecosystem. Grants access to WINTG workshops.",
    },
    cover: "bg-gradient-to-br from-emerald-400 via-teal-400 to-sky-300",
  },
  {
    slug: "kpalimé-keys",
    name: "Kpalimé Keys",
    symbol: "KKEY",
    type: "ERC-1155",
    items: 5000,
    floorWtg: 12,
    ownerCount: 902,
    verified: "blue",
    blurb: {
      fr: "Items in-game pour le studio Kpalimé Studio. Chaque clé débloque des cosmétiques.",
      en: "In-game items for Kpalimé Studio. Each key unlocks cosmetics.",
    },
    cover: "bg-gradient-to-br from-fuchsia-400 via-purple-400 to-indigo-300",
  },
  {
    slug: "savane-art",
    name: "Savane Art",
    symbol: "SVNA",
    type: "ERC-721",
    items: 88,
    floorWtg: 600,
    ownerCount: 64,
    verified: "muted",
    blurb: {
      fr: "Collection d'art digital signée par 12 artistes ouest-africains. Édition limitée à 88 pièces.",
      en: "Digital-art collection signed by 12 West-African artists. Limited edition of 88 pieces.",
    },
    cover: "bg-gradient-to-br from-amber-500 via-yellow-400 to-orange-300",
  },
];

export default function NftsPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang, currency } = useSettings();
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

        <div className="mt-6 flex flex-wrap gap-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <VerifiedBadge tone="gold" size={14} /> {fr ? "Vérifié WINTG" : "WINTG verified"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <VerifiedBadge tone="blue" size={14} /> {fr ? "Créé via WINTG" : "Created via WINTG"}
          </span>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mt-8">
          {COLLECTIONS.map((c) => (
            <Link
              key={c.slug}
              href={`/nfts/${c.slug}?net=${network}`}
              className="card card-hover overflow-hidden group"
            >
              <div className={`aspect-square ${c.cover} relative`}>
                <div className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-full bg-bg/80 backdrop-blur-sm shadow-flat">
                  <VerifiedBadge tone={c.verified} size={14} />
                </div>
                <span className="absolute bottom-3 left-3 pill bg-bg/80 backdrop-blur-sm text-text text-[10px]">
                  {c.type}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-display text-xl sm:text-2xl text-text truncate group-hover:text-accent transition-colors">
                  {c.name}
                </h3>
                <div className="text-xs text-text-muted">{c.symbol}</div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
                  <span>{c.items.toLocaleString("fr-FR")} {fr ? "items" : "items"}</span>
                  <span className="text-text font-semibold">
                    {formatPriceFromWtg(c.floorWtg, currency)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <p className="mt-6 text-xs text-text-muted">
          {fr
            ? "Les collections déployées via la NFT factory publique apparaîtront automatiquement ici une fois l'indexeur mis en ligne."
            : "Collections deployed via the public NFT factory will surface here automatically once the indexer ships."}
        </p>
      </div>
    </PageShell>
  );
}
