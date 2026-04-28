"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
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
  supply?: string;
  decimals: number;
  pricePerWtg: number;
  glyph: string;
  glyphBg: string;
  description: { fr: string; en: string };
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
    description: {
      fr: "WWTG est l'enveloppe ERC-20 du WTG natif. Ratio 1:1, frappé en déposant du WTG, brûlé en retirant. Utilisé partout où une compatibilité ERC-20 est requise (DEX, lending, marketplaces).",
      en: "WWTG is the ERC-20 wrapper around the native WTG. 1:1 ratio, minted by depositing WTG and burned on withdrawal. Used wherever ERC-20 compatibility is required (DEX, lending, marketplaces).",
    },
  },
];

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
            <h1 className="display text-5xl sm:text-7xl text-text mt-1">{token.name}</h1>
            <div className="text-xl text-text-muted mt-1">{token.symbol}</div>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
          <div className="rounded-3xl bg-wintg-gradient text-accent-fg p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">{fr ? "Prix" : "Price"}</div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">{formatPriceFromWtg(token.pricePerWtg, currency)}</div>
            <div className="mt-1 text-xs opacity-80">{fr ? "1 " + token.symbol : "per " + token.symbol}</div>
          </div>
          <div className="card p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">{fr ? "Supply" : "Supply"}</div>
            <div className="display text-4xl sm:text-5xl mt-2 leading-none">{token.supply ?? "—"}</div>
            <div className="mt-1 text-xs text-text-muted">{token.decimals} decimals</div>
          </div>
          <div className="card-inverse p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">{fr ? "Type" : "Type"}</div>
            <div className="display text-4xl mt-2 leading-none capitalize">{token.type === "native" ? (fr ? "Natif" : "Native") : token.type}</div>
          </div>
          <div className="card p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">{fr ? "Réseau" : "Network"}</div>
            <div className="display text-4xl mt-2 leading-none">{network === "mainnet" ? "Mainnet" : "Testnet"}</div>
            <div className="mt-1 text-xs text-text-muted">Chain {network === "mainnet" ? 2280 : 22800}</div>
          </div>
        </div>

        <section className="card p-6 sm:p-8">
          <h2 className="display text-2xl text-text mb-3">{fr ? "À propos" : "About"}</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {fr ? token.description.fr : token.description.en}
          </p>
          {token.contract && (
            <div className="mt-6 inline-flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-text-muted">{fr ? "Contrat" : "Contract"}</span>
              <Link href={`/address/${token.contract}?net=${network}`} className="link-accent mono text-sm">
                {token.contract}
              </Link>
              <CopyButton value={token.contract} size={14} />
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
