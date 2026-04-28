/* Generates polished FeaturePreview placeholder pages. */
const fs = require("fs");
const path = require("path");

const pages = [
  {
    route: "dex-tracker",
    fr: { title: "DEX tracker", description: "Suivez les paires, les pools et les swaps sur les DEX de WINTG : volume 24 h, liquidité, top tokens, sniffing de pools risqués." },
    en: { title: "DEX tracker", description: "Track pairs, pools and swaps on WINTG DEXes: 24 h volume, liquidity, top tokens, risky-pool sniffing." },
    bullets: {
      fr: ["Top pools par TVL et volume", "Historique des swaps par paire", "Détection de rug pulls et de honeypots", "Charts heure / jour / semaine"],
      en: ["Top pools by TVL and volume", "Swap history per pair", "Rug-pull and honeypot detection", "Hourly / daily / weekly charts"],
    },
  },
  {
    route: "labels",
    fr: { title: "Nuage d'étiquettes", description: "Une vue d'ensemble des adresses connues sur WINTG : exchanges, contrats officiels, validateurs, treasuries. Cherchez par étiquette ou explorez le nuage." },
    en: { title: "Label cloud", description: "An overview of known addresses on WINTG: exchanges, official contracts, validators, treasuries. Search by label or explore the cloud." },
    bullets: {
      fr: ["Recherche full-text", "Étiquettes vérifiées vs communautaires", "API publique pour intégrer les étiquettes"],
      en: ["Full-text search", "Verified vs community labels", "Public API to embed labels"],
    },
  },
  {
    route: "services/token-approvals",
    fr: { title: "Approbations de tokens", description: "Affichez et révoquez les approbations de tokens accordées à des dApps. Une étape essentielle pour protéger vos fonds." },
    en: { title: "Token approvals", description: "Review and revoke the token approvals you have granted to dApps. A critical step to keep your funds safe." },
    bullets: {
      fr: ["Liste de toutes les approbations actives", "Révocation en un clic", "Identification des dApps malveillantes"],
      en: ["List of every active approval", "One-click revoke", "Malicious dApp flagging"],
    },
  },
  {
    route: "services/verified-signatures",
    fr: { title: "Signatures vérifiées", description: "Visualisez, signez et vérifiez des messages avec une adresse WINTG. Idéal pour prouver la propriété d'une adresse hors-chaîne." },
    en: { title: "Verified signatures", description: "View, sign and verify messages using a WINTG address. Ideal for proving ownership of an address off-chain." },
    bullets: {
      fr: ["EIP-191 et EIP-712 pris en charge", "Vérification côté serveur", "Lien permanent vers la signature"],
      en: ["EIP-191 and EIP-712 supported", "Server-side verification", "Permanent link to the signature"],
    },
  },
  {
    route: "services/input-messages",
    fr: { title: "Messages d'entrée (IDM)", description: "Communication décentralisée sur WINTG : envoyez un message en encodant du texte dans le champ data d'une transaction. Lisible par tout le monde, ancré on-chain." },
    en: { title: "Input data messages (IDM)", description: "Decentralised communication on WINTG: send a message by encoding text in the data field of a transaction. Readable by anyone, anchored on-chain." },
    bullets: {
      fr: ["Encodage UTF-8 automatique", "Boîte de réception par adresse", "Compatible avec n'importe quel wallet"],
      en: ["Automatic UTF-8 encoding", "Per-address inbox", "Works with any wallet"],
    },
  },
  {
    route: "services/advanced-filter",
    fr: { title: "Filtre avancé", description: "Filtrez les transactions par adresse, méthode, montant, plage de blocs ou date. Combinez plusieurs critères et exportez en CSV." },
    en: { title: "Advanced filter", description: "Filter transactions by address, method, amount, block range or date. Combine multiple criteria and export as CSV." },
    bullets: {
      fr: ["Opérateurs ET / OU", "Sauvegarde des requêtes", "Export direct en CSV"],
      en: ["AND / OR operators", "Save your queries", "Direct CSV export"],
    },
  },
  {
    route: "services/chat",
    fr: { title: "WINTG Chat", description: "Une messagerie ancrée on-chain entre adresses WINTG : utile pour discuter avec un dApp, un contrat ou un autre utilisateur sans quitter l'explorateur." },
    en: { title: "WINTG Chat", description: "On-chain messaging between WINTG addresses: handy to talk to a dApp, a contract or another user without leaving the explorer." },
    bullets: {
      fr: ["Chiffrement de bout en bout (optionnel)", "Notifications push", "API publique pour les dApps"],
      en: ["Optional end-to-end encryption", "Push notifications", "Public API for dApps"],
    },
  },
  {
    route: "services/code-reader",
    fr: { title: "Lecteur de code", description: "Lisez le code source d'un contrat vérifié directement dans l'explorateur. Coloration syntaxique, navigation entre fichiers, liens vers les imports." },
    en: { title: "Code reader", description: "Read the source code of a verified contract directly in the explorer. Syntax highlighting, file navigation, links to imports." },
  },
  {
    route: "services/verify-contract",
    fr: { title: "Vérifier un contrat", description: "Soumettez le code source d'un contrat déployé pour le rendre lisible publiquement. Recompilation avec les mêmes paramètres et publication des artefacts." },
    en: { title: "Verify a contract", description: "Submit the source code of a deployed contract to make it publicly readable. Recompile with the same settings and publish the artifacts." },
  },
  {
    route: "services/similar-contract",
    fr: { title: "Contrats similaires", description: "Trouvez des contrats au bytecode similaire (clones, forks, copies). Utile pour identifier le code source d'un contrat non vérifié." },
    en: { title: "Similar contracts", description: "Find contracts with similar bytecode (clones, forks, copies). Useful to identify the source of an unverified contract." },
  },
  {
    route: "services/contract-search",
    fr: { title: "Recherche de smart contracts", description: "Recherchez des contrats par nom, par signature de fonction, par interface (ERC-20, ERC-721, etc.) ou par auteur." },
    en: { title: "Smart contract search", description: "Search contracts by name, function signature, interface (ERC-20, ERC-721, etc.) or author." },
  },
  {
    route: "services/contract-diff",
    fr: { title: "Comparateur de contrats", description: "Comparez deux contrats vérifiés côte à côte. Identifiez rapidement les différences entre versions ou entre forks." },
    en: { title: "Contract diff checker", description: "Compare two verified contracts side by side. Quickly identify differences between versions or forks." },
  },
  {
    route: "services/vyper-compiler",
    fr: { title: "Compilateur Vyper en ligne", description: "Compilez votre code Vyper directement depuis le navigateur. Aucune installation requise — versions multiples du compilateur disponibles." },
    en: { title: "Vyper online compiler", description: "Compile your Vyper code straight from the browser. No install required — multiple compiler versions available." },
  },
  {
    route: "services/bytecode-opcode",
    fr: { title: "Bytecode → Opcode", description: "Convertissez le bytecode d'un contrat en opcodes lisibles. Pratique pour comprendre ce qu'un contrat non vérifié fait réellement." },
    en: { title: "Bytecode → Opcode", description: "Convert a contract's bytecode into human-readable opcodes. Handy to understand what an unverified contract really does." },
  },
  {
    route: "services/broadcast-tx",
    fr: { title: "Diffuser une transaction", description: "Diffusez une transaction signée sur le réseau WINTG. Utile quand votre wallet ne peut pas l'envoyer pour vous." },
    en: { title: "Broadcast transaction", description: "Broadcast a signed transaction to the WINTG network. Useful when your wallet cannot send it for you." },
  },
  {
    route: "leaderboard",
    fr: { title: "Classement", description: "Top adresses, top contrats, top validateurs, top tokens. Mise à jour en temps réel." },
    en: { title: "Leaderboard", description: "Top addresses, top contracts, top validators, top tokens. Updated in real-time." },
  },
  {
    route: "directory",
    fr: { title: "Annuaire", description: "Liste organisée des projets, dApps, validateurs et services qui vivent sur la chaîne WINTG." },
    en: { title: "Directory", description: "A curated list of projects, dApps, validators and services living on the WINTG chain." },
  },
  {
    route: "newsletter",
    fr: { title: "Newsletter", description: "Abonnez-vous pour recevoir les annonces, les nouveautés du protocole et les tutoriels directement dans votre boîte mail." },
    en: { title: "Newsletter", description: "Subscribe to receive protocol announcements, product updates and tutorials directly in your inbox." },
  },
];

for (const p of pages) {
  const dir = path.join("src/app", p.route);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "page.tsx");
  const frObj = JSON.stringify({ title: p.fr.title, description: p.fr.description, ...(p.bullets ? { bullets: p.bullets.fr } : {}) });
  const enObj = JSON.stringify({ title: p.en.title, description: p.en.description, ...(p.bullets ? { bullets: p.bullets.en } : {}) });
  const content = `"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={${frObj}}
      en={${enObj}}
    />
  );
}
`;
  fs.writeFileSync(file, content);
  console.log("written " + p.route);
}
