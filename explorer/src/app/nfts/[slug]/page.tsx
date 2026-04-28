"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { StatCluster } from "@/components/StatCluster";
import { VerifiedBadge, type VerifiedTone } from "@/components/VerifiedBadge";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { formatPriceFromWtg } from "@/lib/price";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

interface Collection {
  slug: string;
  name: string;
  symbol: string;
  type: "ERC-721" | "ERC-1155";
  items: number;
  floorWtg: number;
  ownerCount: number;
  totalVolumeWtg: number;
  contract: string;
  owner: string;
  createdAt: string;
  verified: VerifiedTone;
  trustScore: number;
  cover: string;
  description: { fr: string; en: string };
  bytecodeTeaser: string;
}

const COLLECTIONS: Collection[] = [
  {
    slug: "wintg-genesis",
    name: "WINTG Genesis",
    symbol: "WGEN",
    type: "ERC-721",
    items: 1000,
    floorWtg: 250,
    ownerCount: 412,
    totalVolumeWtg: 18_400,
    contract: "0xWG3N0000000000000000000000000000000000",
    owner: "0x0000000000000000000000000000000000000001",
    createdAt: "2026-02-01",
    verified: "gold",
    trustScore: 100,
    cover: "bg-gradient-to-br from-orange-400 via-rose-400 to-amber-300",
    description: {
      fr: "Première collection officielle WINTG. 1 000 pièces de fondation distribuées aux premiers contributeurs et validateurs.",
      en: "The first official WINTG collection. 1 000 founding pieces distributed to early contributors and validators.",
    },
    bytecodeTeaser: "0x6080604052348015...",
  },
  {
    slug: "uemoa-builders",
    name: "UEMOA Builders",
    symbol: "UBUI",
    type: "ERC-721",
    items: 250,
    floorWtg: 80,
    ownerCount: 138,
    totalVolumeWtg: 4_200,
    contract: "0xUBU100000000000000000000000000000000",
    owner: "0x0000000000000000000000000000000000000002",
    createdAt: "2026-02-18",
    verified: "blue",
    trustScore: 88,
    cover: "bg-gradient-to-br from-emerald-400 via-teal-400 to-sky-300",
    description: {
      fr: "Carte de membre on-chain pour les builders de l'écosystème UEMOA.",
      en: "On-chain membership card for builders in the UEMOA ecosystem.",
    },
    bytecodeTeaser: "0x6080604052348015...",
  },
  {
    slug: "kpalimé-keys",
    name: "Kpalimé Keys",
    symbol: "KKEY",
    type: "ERC-1155",
    items: 5000,
    floorWtg: 12,
    ownerCount: 902,
    totalVolumeWtg: 920,
    contract: "0xKKEY00000000000000000000000000000000",
    owner: "0x0000000000000000000000000000000000000003",
    createdAt: "2026-03-05",
    verified: "blue",
    trustScore: 78,
    cover: "bg-gradient-to-br from-fuchsia-400 via-purple-400 to-indigo-300",
    description: {
      fr: "Items in-game pour le studio Kpalimé Studio.",
      en: "In-game items for Kpalimé Studio.",
    },
    bytecodeTeaser: "0x6080604052348015...",
  },
  {
    slug: "savane-art",
    name: "Savane Art",
    symbol: "SVNA",
    type: "ERC-721",
    items: 88,
    floorWtg: 600,
    ownerCount: 64,
    totalVolumeWtg: 14_300,
    contract: "0x5AVA00000000000000000000000000000000",
    owner: "0x0000000000000000000000000000000000000004",
    createdAt: "2026-03-22",
    verified: "muted",
    trustScore: 55,
    cover: "bg-gradient-to-br from-amber-500 via-yellow-400 to-orange-300",
    description: {
      fr: "Collection d'art digital signée par 12 artistes ouest-africains.",
      en: "Digital-art collection signed by 12 West-African artists.",
    },
    bytecodeTeaser: "0x6080604052348015...",
  },
];

function trustClass(s: number): string {
  if (s >= 90) return "text-emerald-500";
  if (s >= 70) return "text-amber-500";
  return "text-rose-500";
}

export default function NftDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang, currency } = useSettings();
  const fr = lang === "fr";

  const c = COLLECTIONS.find((x) => x.slug === decodeURIComponent(params.slug).toLowerCase());
  if (!c) notFound();

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <Link href={`/nfts?net=${network}`} className="hover:text-text">NFTs</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text">{c.name}</span>
        </nav>

        <header className="grid lg:grid-cols-[280px_1fr] gap-6 sm:gap-8 mb-10">
          <div className={`aspect-square ${c.cover} rounded-3xl shadow-flat`} />
          <div>
            <span className="pill bg-surface-2 text-text-muted text-[10px]">{c.type}</span>
            <h1 className="display text-5xl sm:text-7xl text-text mt-3 inline-flex items-center gap-3">
              {c.name}
              <VerifiedBadge tone={c.verified} size={28} />
            </h1>
            <div className="text-xl text-text-muted mt-1">{c.symbol}</div>
            <p className="mt-5 text-sm text-text-muted leading-relaxed max-w-xl">
              {fr ? c.description.fr : c.description.en}
            </p>
          </div>
        </header>

        <StatCluster>
          <div className="stat-cell-accent">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">
              {fr ? "Floor" : "Floor"}
            </div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">
              {formatPriceFromWtg(c.floorWtg, currency)}
            </div>
            <div className="mt-1 text-xs opacity-80">{c.floorWtg} WTG</div>
          </div>
          <div className="stat-cell">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Items" : "Items"}
            </div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none text-text">
              {c.items.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-xs text-text-muted">{c.ownerCount} {fr ? "détenteurs" : "owners"}</div>
          </div>
          <div className="stat-cell-inverse">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
              {fr ? "Trust score" : "Trust score"}
            </div>
            <div className={`display text-4xl sm:text-5xl mt-2 leading-none ${trustClass(c.trustScore)}`}>
              {c.trustScore}
              <span className="text-2xl opacity-60">/100</span>
            </div>
          </div>
          <div className="stat-cell">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {fr ? "Volume total" : "Total volume"}
            </div>
            <div className="display text-4xl mt-2 leading-none text-text">
              {c.totalVolumeWtg.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-xs text-text-muted">WTG</div>
          </div>
        </StatCluster>

        {/* Contract info */}
        <section className="card p-6 sm:p-8 mt-6">
          <h2 className="display text-2xl text-text mb-4">{fr ? "Informations" : "Contract info"}</h2>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="sm:col-span-2 flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Contrat" : "Contract"}
              </dt>
              <dd className="flex items-center gap-2 min-w-0">
                <Link href={`/address/${c.contract}?net=${network}`} className="link-accent mono text-sm break-all">
                  {c.contract}
                </Link>
                <CopyButton value={c.contract} size={14} />
              </dd>
            </div>
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Propriétaire" : "Owner"}
              </dt>
              <dd className="flex items-center gap-2 min-w-0">
                <Link href={`/address/${c.owner}?net=${network}`} className="link-accent mono text-sm break-all">
                  {c.owner}
                </Link>
                <CopyButton value={c.owner} size={14} />
              </dd>
            </div>
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Créée le" : "Created"}
              </dt>
              <dd className="text-sm text-text">{c.createdAt}</dd>
            </div>
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                Standard
              </dt>
              <dd className="text-sm text-text">{c.type}</dd>
            </div>
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Vérification" : "Verification"}
              </dt>
              <dd className="inline-flex items-center gap-2">
                <VerifiedBadge tone={c.verified} size={14} />
                <span className="text-sm text-text capitalize">
                  {c.verified === "gold" ? (fr ? "Audité WINTG"  : "WINTG audited")
                   : c.verified === "blue" ? (fr ? "Factory WINTG" : "WINTG factory")
                   : (fr ? "Non vérifié" : "Not verified")}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Transactions */}
        <section className="card p-6 sm:p-8 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="display text-2xl text-text">{fr ? "Transactions" : "Transactions"}</h2>
            <Link href={`/address/${c.contract}?net=${network}`} className="text-xs font-semibold text-accent hover:opacity-80">
              {fr ? "Voir toutes →" : "View all →"}
            </Link>
          </div>
          <p className="text-sm text-text-muted">
            {fr
              ? "Les transferts récents s'afficheront ici via l'indexeur. Pour l'instant, ouvrez la page de l'adresse du contrat."
              : "Recent transfers will surface here through the indexer. For now, open the contract address page."}
          </p>
        </section>

        {/* Code teaser */}
        <section className="card p-6 sm:p-8 mt-6">
          <h2 className="display text-2xl text-text mb-3">{fr ? "Code du contrat" : "Contract code"}</h2>
          <pre className="bg-surface-2 rounded-xl p-4 text-xs mono overflow-x-auto break-all whitespace-pre-wrap">
            {c.bytecodeTeaser}…
          </pre>
          <p className="text-xs text-text-muted mt-3">
            {fr
              ? "Bytecode complet et vérification du code source disponibles sur la page d'adresse."
              : "Full bytecode and source-code verification available on the address page."}
          </p>
        </section>
      </div>
    </PageShell>
  );
}
