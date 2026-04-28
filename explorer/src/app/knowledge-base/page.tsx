"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

interface Article {
  slug: string;
  category: { fr: string; en: string };
  titleFr: string;
  titleEn: string;
  excerptFr: string;
  excerptEn: string;
}

const ARTICLES: Article[] = [
  {
    slug: "what-is-wintg",
    category: { fr: "Démarrer", en: "Getting started" },
    titleFr: "Qu'est-ce que la blockchain WINTG ?",
    titleEn: "What is the WINTG blockchain?",
    excerptFr: "Une L1 EVM-compatible, blocs de 1 s, frais minuscules. L'architecture, les choix techniques et la philosophie.",
    excerptEn: "An EVM-compatible L1 with 1 s blocks and tiny fees. The architecture, the design choices and the philosophy behind it.",
  },
  {
    slug: "use-wintg-scan",
    category: { fr: "Démarrer", en: "Getting started" },
    titleFr: "Utiliser WINTG Scan",
    titleEn: "How to use WINTG Scan",
    excerptFr: "Tour d'horizon de l'explorateur : recherche, lecture d'un bloc, d'une transaction, d'un contrat.",
    excerptEn: "A walkthrough of the explorer: search, reading a block, a transaction, a contract.",
  },
  {
    slug: "add-wintg-wallet",
    category: { fr: "Wallets", en: "Wallets" },
    titleFr: "Ajouter WINTG à votre wallet",
    titleEn: "Add WINTG to your wallet",
    excerptFr: "MetaMask, Trust Wallet, Rabby — comment configurer le réseau WINTG en 30 secondes.",
    excerptEn: "MetaMask, Trust Wallet, Rabby — how to set up the WINTG network in 30 seconds.",
  },
  {
    slug: "send-receive-wtg",
    category: { fr: "Wallets", en: "Wallets" },
    titleFr: "Envoyer et recevoir des WTG",
    titleEn: "Send and receive WTG",
    excerptFr: "Le b.a.-ba pour les premiers transferts : adresse, frais, confirmation, statut sur Scan.",
    excerptEn: "The basics of your first transfers: address, fee, confirmation, status on Scan.",
  },
  {
    slug: "verify-contract",
    category: { fr: "Pour les développeurs", en: "For developers" },
    titleFr: "Vérifier un smart contract",
    titleEn: "Verify a smart contract",
    excerptFr: "Pourquoi la vérification compte, comment soumettre votre code source.",
    excerptEn: "Why verification matters and how to submit your source code.",
  },
  {
    slug: "api-plans",
    category: { fr: "API", en: "API" },
    titleFr: "Choisir un plan API",
    titleEn: "Choosing an API plan",
    excerptFr: "Différences entre Free et Pro, limites de débit, comment générer une clé.",
    excerptEn: "Free vs Pro, rate limits, how to generate a key.",
  },
  {
    slug: "become-validator",
    category: { fr: "Validateurs", en: "Validators" },
    titleFr: "Devenir validateur",
    titleEn: "Becoming a validator",
    excerptFr: "Configuration matérielle, candidature on-chain, bond en USD, slashing.",
    excerptEn: "Hardware spec, on-chain candidacy, USD bond, slashing.",
  },
  {
    slug: "fees-and-tokenomics",
    category: { fr: "Tokenomics", en: "Tokenomics" },
    titleFr: "Frais et tokenomics WTG",
    titleEn: "WTG fees and tokenomics",
    excerptFr: "Comment les frais sont calculés, où vont les WTG collectés.",
    excerptEn: "How fees are computed and where the collected WTG flow.",
  },
  {
    slug: "tokens-and-nfts",
    category: { fr: "Tokens & NFT", en: "Tokens & NFTs" },
    titleFr: "Créer un token ou un NFT sur WINTG",
    titleEn: "Create a token or NFT on WINTG",
    excerptFr: "Pas-à-pas pour utiliser les factories ERC-20 / 721 / 1155.",
    excerptEn: "Step by step using the ERC-20 / 721 / 1155 factories.",
  },
  {
    slug: "security-best-practices",
    category: { fr: "Sécurité", en: "Security" },
    titleFr: "Bonnes pratiques de sécurité",
    titleEn: "Security best practices",
    excerptFr: "Protéger ses clés, repérer les contrats malveillants, gérer ses approvals.",
    excerptEn: "Protect your keys, spot malicious contracts, manage your approvals.",
  },
];

export default function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const groups: Record<string, Article[]> = {};
  for (const a of ARTICLES) {
    const cat = fr ? a.category.fr : a.category.en;
    (groups[cat] ??= []).push(a);
  }

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Base de connaissances" : "Knowledge base"}
        </h1>
        <p className="mt-5 text-text-muted text-lg max-w-2xl">
          {fr
            ? "Tout ce qu'il faut pour bien comprendre WINTG Scan, la blockchain, les wallets, les API et la sécurité."
            : "Everything you need to really get WINTG Scan, the chain, wallets, the API and security."}
        </p>

        {Object.entries(groups).map(([cat, articles]) => (
          <section key={cat} className="mt-12">
            <h2 className="display text-3xl text-text">{cat}</h2>
            <div className="grid sm:grid-cols-2 gap-5 mt-5">
              {articles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/knowledge-base/${a.slug}`}
                  className="card card-hover p-6 group"
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent">
                    {fr ? a.category.fr : a.category.en}
                  </div>
                  <h3 className="mt-2 font-display text-2xl text-text group-hover:text-accent transition-colors">
                    {fr ? a.titleFr : a.titleEn}
                  </h3>
                  <p className="mt-2 text-sm text-text-muted leading-relaxed">
                    {fr ? a.excerptFr : a.excerptEn}
                  </p>
                  <div className="mt-4 text-xs text-accent font-semibold">
                    {fr ? "Lire l'article" : "Read article"} →
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
