"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { StatCluster } from "@/components/StatCluster";
import { VerifiedBadge, type VerifiedTone } from "@/components/VerifiedBadge";
import { Sparkline, mockSeries } from "@/components/Sparkline";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { formatPriceFromWtg } from "@/lib/price";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

interface Token {
  slug: string;
  symbol: string;
  name: string;
  type: "native" | "wrapped" | "erc20";
  contract?: string;
  /** Address that deployed / owns the token */
  owner?: string;
  /** Block-explorer creation tx hash */
  creationTx?: string;
  /** ISO date of token creation */
  createdAt?: string;
  supply?: string;
  decimals: number;
  pricePerWtg: number;
  glyph: string;
  glyphBg: string;
  verified: VerifiedTone;
  /** 0-100. Higher = more trustworthy */
  trustScore: number;
  description: { fr: string; en: string };
  /** Optional bytecode-snippet teaser */
  bytecode?: string;
}

const TOKENS: Token[] = [
  {
    slug: "wtg",
    symbol: "WTG",
    name: "WINTG",
    type: "native",
    decimals: 18,
    supply: "1 000 000 000",
    pricePerWtg: 1,
    glyph: "W",
    glyphBg: "bg-wintg-gradient",
    verified: "gold",
    trustScore: 100,
    owner: "0x0000000000000000000000000000000000000000",
    createdAt: "2026-01-15",
    description: {
      fr: "WTG est l'actif natif de la chaîne WINTG. Il sert au paiement du gaz, aux transferts de valeur, au staking et à la gouvernance des contrats du réseau.",
      en: "WTG is the native asset of the WINTG chain. It is used to pay gas, transfer value, stake and govern the network's contracts.",
    },
  },
  {
    slug: "wwtg",
    symbol: "WWTG",
    name: "Wrapped WINTG",
    type: "wrapped",
    decimals: 18,
    contract: "0x59E27B7c9119fC5Ff04C855eEDfeD7c53f24b53C",
    pricePerWtg: 1,
    glyph: "W",
    glyphBg: "bg-inverse text-inverse-fg",
    verified: "gold",
    trustScore: 96,
    owner: "0x0000000000000000000000000000000000000000",
    createdAt: "2026-01-20",
    description: {
      fr: "WWTG est l'enveloppe ERC-20 du WTG natif. Ratio 1:1, frappé en déposant du WTG, brûlé en retirant. Utilisé partout où une compatibilité ERC-20 est requise (DEX, lending, marketplaces).",
      en: "WWTG is the ERC-20 wrapper around the native WTG. 1:1 ratio, minted by depositing WTG and burned on withdrawal. Used wherever ERC-20 compatibility is required (DEX, lending, marketplaces).",
    },
    bytecode: "0x60806040523480156100105760...",
  },
];

function trustClass(score: number): string {
  if (score >= 90) return "text-emerald-500";
  if (score >= 70) return "text-amber-500";
  return "text-rose-500";
}

function trustLabel(score: number, fr: boolean): string {
  if (score >= 90) return fr ? "Excellent" : "Excellent";
  if (score >= 70) return fr ? "Bon"        : "Good";
  if (score >= 40) return fr ? "Moyen"      : "Average";
  return fr ? "Faible" : "Low";
}

export default function TokenDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang, currency } = useSettings();
  const fr = lang === "fr";

  const token = TOKENS.find((t) => t.slug === params.slug.toLowerCase());
  if (!token) notFound();

  const series = mockSeries(token.slug.length * 7 + 1, 60, 1, 0.025);

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <nav className="text-sm text-text-muted mb-4">
          <Link href={`/?net=${network}`} className="hover:text-text">Home</Link>
          <span className="mx-2 text-text-faint">/</span>
          <Link href={`/tokens?net=${network}`} className="hover:text-text">Tokens</Link>
          <span className="mx-2 text-text-faint">/</span>
          <span className="text-text">{token.symbol}</span>
        </nav>

        <header className="flex flex-col sm:flex-row sm:items-end gap-6 mb-10">
          <div className={`w-24 h-24 rounded-3xl grid place-items-center font-display text-5xl shrink-0 ${token.glyphBg}`}>
            {token.glyph}
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
              {token.type === "native" ? (fr ? "Token natif" : "Native token") : token.type.toUpperCase()}
            </div>
            <h1 className="display text-5xl sm:text-7xl text-text mt-1 inline-flex items-center gap-3">
              {token.name}
              <VerifiedBadge tone={token.verified} size={28} />
            </h1>
            <div className="text-xl text-text-muted mt-1">{token.symbol}</div>
          </div>
        </header>

        <StatCluster>
          <div className="stat-cell-accent">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">{fr ? "Prix" : "Price"}</div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">{formatPriceFromWtg(token.pricePerWtg, currency)}</div>
            <div className="mt-1 text-xs opacity-80">{fr ? "par " : "per "}{token.symbol}</div>
          </div>
          <div className="stat-cell">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">{fr ? "Supply" : "Supply"}</div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none text-text">{token.supply ?? "—"}</div>
            <div className="mt-1 text-xs text-text-muted">{token.decimals} decimals</div>
          </div>
          <div className="stat-cell-inverse">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">{fr ? "Trust score" : "Trust score"}</div>
            <div className={`display text-4xl sm:text-5xl mt-2 leading-none ${trustClass(token.trustScore)}`}>
              {token.trustScore}
              <span className="text-2xl opacity-60">/100</span>
            </div>
            <div className="mt-1 text-xs opacity-70">{trustLabel(token.trustScore, fr)}</div>
          </div>
          <div className="stat-cell">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">{fr ? "Réseau" : "Network"}</div>
            <div className="display text-4xl mt-2 leading-none text-text">{network === "mainnet" ? "Mainnet" : "Testnet"}</div>
            <div className="mt-1 text-xs text-text-muted">Chain {network === "mainnet" ? 2280 : 22800}</div>
          </div>
        </StatCluster>

        {/* 60-day price strip */}
        <section className="card mt-6 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Évolution (60 jours)" : "Price action (60 days)"}
              </div>
              <div className="font-display text-2xl text-text mt-1">{token.symbol}/WTG</div>
            </div>
            <span className="text-xs text-text-muted">
              {fr ? "Données simulées · indexeur arrive" : "Mock data · indexer coming"}
            </span>
          </div>
          <div className="-mx-2">
            <Sparkline data={series} width={1100} height={120} trend="auto" />
          </div>
        </section>

        {/* About + contract info */}
        <section className="card p-6 sm:p-8 mt-6">
          <h2 className="display text-2xl text-text mb-3">{fr ? "À propos" : "About"}</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {fr ? token.description.fr : token.description.en}
          </p>

          <dl className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {token.contract && (
              <div className="sm:col-span-2 flex items-center flex-wrap gap-2 border-b border-border pb-3">
                <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                  {fr ? "Adresse du contrat" : "Contract address"}
                </dt>
                <dd className="flex items-center gap-2 min-w-0">
                  <Link href={`/address/${token.contract}?net=${network}`} className="link-accent mono text-sm break-all">
                    {token.contract}
                  </Link>
                  <CopyButton value={token.contract} size={14} />
                </dd>
              </div>
            )}
            {token.owner && (
              <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
                <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                  {fr ? "Propriétaire" : "Owner"}
                </dt>
                <dd className="flex items-center gap-2 min-w-0">
                  <Link href={`/address/${token.owner}?net=${network}`} className="link-accent mono text-sm break-all">
                    {token.owner}
                  </Link>
                  <CopyButton value={token.owner} size={14} />
                </dd>
              </div>
            )}
            {token.createdAt && (
              <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
                <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                  {fr ? "Créé le" : "Created"}
                </dt>
                <dd className="text-sm text-text">{token.createdAt}</dd>
              </div>
            )}
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Décimales" : "Decimals"}
              </dt>
              <dd className="text-sm text-text">{token.decimals}</dd>
            </div>
            <div className="flex items-center flex-wrap gap-2 border-b border-border pb-3">
              <dt className="text-xs uppercase tracking-wider text-text-muted shrink-0">
                {fr ? "Type" : "Type"}
              </dt>
              <dd className="text-sm text-text capitalize">{token.type}</dd>
            </div>
          </dl>
        </section>

        {/* Transactions teaser (link out to address page when contract exists) */}
        <section className="card p-6 sm:p-8 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="display text-2xl text-text">{fr ? "Transactions" : "Transactions"}</h2>
            {token.contract && (
              <Link href={`/address/${token.contract}?net=${network}`} className="text-xs font-semibold text-accent hover:opacity-80">
                {fr ? "Voir toutes →" : "View all →"}
              </Link>
            )}
          </div>
          <p className="text-sm text-text-muted">
            {fr
              ? "Les transferts ERC-20 récents s'afficheront ici via l'indexeur. En attendant, ouvrez la page de l'adresse du contrat pour explorer les transactions liées."
              : "Recent ERC-20 transfers will surface here through the indexer. In the meantime, open the contract address page to browse linked transactions."}
          </p>
        </section>

        {/* Contract code teaser */}
        {token.bytecode && (
          <section className="card p-6 sm:p-8 mt-6">
            <h2 className="display text-2xl text-text mb-3">{fr ? "Code du contrat" : "Contract code"}</h2>
            <pre className="bg-surface-2 rounded-xl p-4 text-xs mono overflow-x-auto break-all whitespace-pre-wrap">
              {token.bytecode}…
            </pre>
            <p className="text-xs text-text-muted mt-3">
              {fr
                ? "Ouvrez la page d'adresse pour le bytecode complet, l'ABI et la vérification du code source."
                : "Open the address page for the full bytecode, ABI and source-code verification."}
            </p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
