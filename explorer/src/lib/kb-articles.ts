/**
 * Knowledge-base article content.
 * --------------------------------
 * Long-form articles for /knowledge-base/[slug]. Stored as a flat dataset
 * of bilingual sections so the rendering page stays trivially simple.
 *
 * Section types:
 *   - h2     → heading
 *   - p      → paragraph
 *   - ul     → bullet list (items separated by `\n`)
 *   - quote  → block quote
 *   - code   → inline code block (preformatted, mono)
 *   - kv     → 2-column "label: value" rows (items separated by `\n`,
 *              key/value separated by `::`)
 *
 * Adding a new article:
 *   1. Define it inside the KB_ARTICLES array.
 *   2. Reference its slug from `/knowledge-base` and the article will pick
 *      up the listing card automatically (see kb-articles is the source of
 *      truth for slugs that have content).
 */

export type Section =
  | { type: "h2";    fr: string; en: string }
  | { type: "p";     fr: string; en: string }
  | { type: "ul";    fr: string; en: string }
  | { type: "quote"; fr: string; en: string }
  | { type: "code";  text: string; lang?: string }
  | { type: "kv";    fr: string; en: string };

export interface KbArticle {
  slug: string;
  category: { fr: string; en: string };
  title:    { fr: string; en: string };
  excerpt:  { fr: string; en: string };
  /** Reading time in minutes. */
  readingMinutes: number;
  sections: Section[];
}

export const KB_ARTICLES: KbArticle[] = [
  {
    slug: "what-is-wintg",
    category: { fr: "Démarrer", en: "Getting started" },
    title: {
      fr: "Qu'est-ce que la blockchain WINTG ?",
      en: "What is the WINTG blockchain?",
    },
    excerpt: {
      fr: "Une L1 EVM-compatible souveraine pour le marché africain. Blocs de 1 s, frais minuscules, finalité instantanée.",
      en: "A sovereign EVM-compatible L1 for the African market. 1-second blocks, tiny fees, instant finality.",
    },
    readingMinutes: 6,
    sections: [
      {
        type: "p",
        fr: "WINTG est une blockchain Layer 1 souveraine, EVM-compatible, conçue pour le marché africain — Togo d'abord, UEMOA ensuite. L'objectif est simple : offrir un socle technique rapide et bon marché pour les paiements, le e-commerce, les remittances Mobile Money, le gaming et les NFT, sans dépendre des chaînes étrangères.",
        en: "WINTG is a sovereign EVM-compatible Layer 1 blockchain, built for the African market — Togo first, then the wider UEMOA region. The goal is simple: deliver a fast and cheap technical layer for payments, e-commerce, Mobile-Money remittances, gaming and NFTs, without depending on foreign chains.",
      },
      {
        type: "h2",
        fr: "Architecture",
        en: "Architecture",
      },
      {
        type: "p",
        fr: "Sous le capot, WINTG s'appuie sur Hyperledger Besu et le consensus IBFT 2.0 (Proof of Authority). Ce choix donne une finalité instantanée — pas d'attente de N confirmations, un bloc validé est définitif. La sécurité repose sur un comité de validateurs autorisés, qui s'agrandit au fil du temps.",
        en: "Under the hood, WINTG runs on Hyperledger Besu with IBFT 2.0 consensus (Proof of Authority). That choice gives instant finality — no waiting for N confirmations, a validated block is final. Security relies on a permissioned validator committee that grows over time.",
      },
      {
        type: "kv",
        fr: "Chain ID :: 2280 (mainnet) · 22800 (testnet)\nClient :: Hyperledger Besu (dernière stable)\nConsensus :: IBFT 2.0 (PoA)\nBlock time :: 1 seconde\nGas limit :: 100 millions\nFinalité :: instantanée\nLangage :: Solidity 0.8.24+ avec OpenZeppelin v5",
        en:
          "Chain ID :: 2280 (mainnet) · 22800 (testnet)\nClient :: Hyperledger Besu (latest stable)\nConsensus :: IBFT 2.0 (PoA)\nBlock time :: 1 second\nGas limit :: 100 million\nFinality :: instant\nLanguage :: Solidity 0.8.24+ with OpenZeppelin v5",
      },
      {
        type: "h2",
        fr: "Le token WTG",
        en: "The WTG token",
      },
      {
        type: "p",
        fr: "Le token natif s'appelle WTG. Supply fixe d'un milliard, 18 décimales. Les frais de transaction sont payés en WTG. Le modèle est mixte : supply fixe + brûlage déflationniste sur les frais + inflation plafonnée pour le staking. Une transaction typique sur WINTG coûte une fraction d'un centime de FCFA.",
        en: "The native asset is called WTG. Fixed supply of one billion, 18 decimals. Transaction fees are paid in WTG. The model is mixed: fixed supply + deflationary fee burn + capped staking inflation. A typical transaction on WINTG costs a fraction of a CFA cent.",
      },
      {
        type: "h2",
        fr: "Distribution des frais",
        en: "Fee distribution",
      },
      {
        type: "ul",
        fr: "Treasury : 40% — financement du développement et des partenariats\nValidateurs : 50% — récompense pour la sécurité du réseau\nBurn : 5% — pression déflationniste\nCommunauté : 5% — bounty programs et grants",
        en: "Treasury: 40% — funding development and partnerships\nValidators: 50% — reward for securing the network\nBurn: 5% — deflationary pressure\nCommunity: 5% — bounty programs and grants",
      },
      {
        type: "h2",
        fr: "Pourquoi WINTG plutôt qu'une autre chaîne ?",
        en: "Why WINTG rather than another chain?",
      },
      {
        type: "p",
        fr: "Trois raisons concrètes : (1) frais quasi-nuls compatibles avec les usages africains (paiements de quelques CFA), (2) un bridge Mobile Money en cours de construction côté Phase 2, (3) un écosystème panafricain assumé — communauté francophone, documentation FR/EN, support local.",
        en: "Three concrete reasons: (1) near-zero fees that match African use-cases (CFA-cent payments), (2) a Mobile-Money bridge under construction in Phase 2, (3) an unapologetically pan-African ecosystem — French-speaking community, FR/EN documentation, local support.",
      },
    ],
  },

  {
    slug: "use-wintg-scan",
    category: { fr: "Démarrer", en: "Getting started" },
    title: {
      fr: "Utiliser WINTG Scan",
      en: "How to use WINTG Scan",
    },
    excerpt: {
      fr: "Tour d'horizon de l'explorateur officiel : recherche, blocs, transactions, contrats, outils.",
      en: "A walkthrough of the official explorer: search, blocks, transactions, contracts, tools.",
    },
    readingMinutes: 5,
    sections: [
      {
        type: "p",
        fr: "WINTG Scan est l'explorateur officiel de la chaîne WINTG. Il indexe tous les blocs et toutes les transactions du réseau, et donne accès à des outils pour développeurs (décodeurs, vérification de contrats, broadcast de tx).",
        en: "WINTG Scan is the official explorer of the WINTG chain. It indexes every block and every transaction on the network, and ships developer tools (decoders, contract verification, tx broadcasting).",
      },
      {
        type: "h2",
        fr: "La barre de recherche",
        en: "The search bar",
      },
      {
        type: "p",
        fr: "La barre du haut accepte plusieurs formats. Collez :",
        en: "The top bar accepts several formats. Paste:",
      },
      {
        type: "ul",
        fr: "une adresse 0x… (40 chars) pour ouvrir le compte ou le contrat\nun hash de tx 0x… (64 chars) pour la transaction\nun numéro de bloc (entier) ou un hash de bloc 0x…\nun nom .wtg pour résoudre une adresse via la registry\nle symbole d'un token (par ex. WTG, WWTG) pour ouvrir sa fiche",
        en: "a 0x… address (40 chars) to open the account or contract\na 0x… tx hash (64 chars) to open the transaction\na block number (integer) or a 0x… block hash\na .wtg name to resolve an address through the registry\na token symbol (e.g. WTG, WWTG) to open its page",
      },
      {
        type: "h2",
        fr: "Lire un bloc",
        en: "Reading a block",
      },
      {
        type: "p",
        fr: "Une page bloc affiche en haut un cluster de stats — hauteur, horodatage, gas utilisé, validateur. En dessous, la liste des transactions incluses, avec un raccourci vers chacune.",
        en: "A block page shows a stat cluster at the top — height, timestamp, gas used, validator. Below it, the list of included transactions with a shortcut to each.",
      },
      {
        type: "h2",
        fr: "Lire une transaction",
        en: "Reading a transaction",
      },
      {
        type: "p",
        fr: "La page transaction donne le statut (success ou revert), le from / to, la valeur en WTG, le gas dépensé et l'input data. Pour décoder l'input quand le contrat n'est pas vérifié, utilisez l'outil Input Data Decoder.",
        en: "The transaction page gives status (success or revert), from / to, value in WTG, gas spent and the input data. To decode the input when the contract isn't verified, use the Input Data Decoder tool.",
      },
      {
        type: "h2",
        fr: "Outils & services",
        en: "Tools & services",
      },
      {
        type: "ul",
        fr: "Outils : décodeur / encodeur d'input data, convertisseur d'unités (wei ↔ gwei ↔ ether), export CSV, vérificateur de balance\nServices : vérification de contrat, signatures vérifiées, IDM (input messages), Bytecode → Opcode\nExplore : gas tracker, DEX tracker, node tracker, label cloud, recherche de domaines .wtg",
        en: "Tools: input data decoder / encoder, unit converter (wei ↔ gwei ↔ ether), CSV export, balance checker\nServices: contract verification, verified signatures, IDM (input messages), Bytecode → Opcode\nExplore: gas tracker, DEX tracker, node tracker, label cloud, .wtg domain lookup",
      },
      {
        type: "h2",
        fr: "Mainnet vs Testnet",
        en: "Mainnet vs Testnet",
      },
      {
        type: "p",
        fr: "Le sélecteur en haut à droite bascule entre mainnet (chain 2280) et testnet (chain 22800). Toutes les pages partagent le query param ?net=, donc les liens entre pages restent dans le même réseau.",
        en: "The top-right switcher toggles between mainnet (chain 2280) and testnet (chain 22800). Every page shares the ?net= query param, so links between pages stay on the same network.",
      },
    ],
  },

  {
    slug: "verify-contract",
    category: { fr: "Pour les développeurs", en: "For developers" },
    title: {
      fr: "Vérifier un smart contract sur WINTG",
      en: "Verifying a smart contract on WINTG",
    },
    excerpt: {
      fr: "Pourquoi la vérification compte, comment soumettre votre code source, ce qui est validé.",
      en: "Why verification matters, how to submit your source code, what gets validated.",
    },
    readingMinutes: 7,
    sections: [
      {
        type: "p",
        fr: "Vérifier un smart contract, c'est prouver publiquement que le bytecode déployé sur la chaîne correspond bien au code source que vous publiez. Sans vérification, un utilisateur n'a aucune garantie sur ce que fait réellement le contrat — il ne voit que des opcodes.",
        en: "Verifying a smart contract means proving publicly that the bytecode deployed on-chain matches the source code you publish. Without verification, a user has no real guarantee about what the contract does — they only see opcodes.",
      },
      {
        type: "h2",
        fr: "Pourquoi vérifier",
        en: "Why verify",
      },
      {
        type: "ul",
        fr: "Confiance — les utilisateurs voient l'ABI et peuvent appeler vos fonctions depuis Scan\nAuditabilité — les outils peuvent analyser votre code\nÉligibilité au badge or « WINTG verified »\nMeilleur référencement dans la recherche",
        en: "Trust — users see the ABI and can call your functions directly from Scan\nAuditability — tooling can analyse your code\nEligibility for the « WINTG verified » gold badge\nBetter ranking in search",
      },
      {
        type: "h2",
        fr: "Étape 1 — préparer le code",
        en: "Step 1 — prepare the source",
      },
      {
        type: "p",
        fr: "Vous avez besoin du fichier .sol exact qui a été compilé pour le déploiement, avec la même version de Solidity, les mêmes optimizations runs et le même EVM target. Si vous utilisez Hardhat ou Foundry, gardez le artifacts/ et le foundry.toml / hardhat.config.ts du moment du déploiement.",
        en: "You need the exact .sol file that was compiled for deployment, with the same Solidity version, same optimizer runs and same EVM target. If you use Hardhat or Foundry, keep the artifacts/ and the foundry.toml / hardhat.config.ts from the time of deployment.",
      },
      {
        type: "h2",
        fr: "Étape 2 — soumettre",
        en: "Step 2 — submit",
      },
      {
        type: "p",
        fr: "Allez sur /services/verify-contract. Renseignez :",
        en: "Go to /services/verify-contract. Fill in:",
      },
      {
        type: "ul",
        fr: "Adresse du contrat\nVersion exacte du compilateur (ex. v0.8.24+commit.e11b9ed9)\nOptimizer runs (ex. 200)\nLicence SPDX\nFichier source unique OU bundle JSON Standard Input (multi-fichiers)\nArguments du constructeur ABI-encodés (si applicable)",
        en: "Contract address\nExact compiler version (e.g. v0.8.24+commit.e11b9ed9)\nOptimizer runs (e.g. 200)\nSPDX license\nSingle source file OR Standard JSON Input bundle (multi-file)\nABI-encoded constructor args (if applicable)",
      },
      {
        type: "h2",
        fr: "Étape 3 — ce qui est vérifié",
        en: "Step 3 — what gets verified",
      },
      {
        type: "p",
        fr: "Scan recompile votre code avec les mêmes paramètres que ceux que vous avez fournis, puis compare le bytecode runtime déployé. La vérification réussit uniquement si les deux correspondent. Le metadata hash en fin de bytecode est ignoré (CBOR), donc le whitespace de votre source n'a pas d'importance.",
        en: "Scan recompiles your source with the parameters you provided, then compares it against the deployed runtime bytecode. Verification only succeeds if both match. The metadata hash at the end of the bytecode is ignored (CBOR), so source whitespace doesn't matter.",
      },
      {
        type: "h2",
        fr: "Erreurs courantes",
        en: "Common errors",
      },
      {
        type: "ul",
        fr: "Mauvaise version du compilateur — utilisez exactement celle d'origine\nOptimizer runs différents — Hardhat = 200 par défaut, Foundry = 200 aussi mais peut être surchargé\nImports OZ non identiques (changement de version mineure d'OpenZeppelin)\nArguments du constructeur incorrectement ABI-encodés — pensez à `cast abi-encode \"constructor(...)\" arg1 arg2` (Foundry)",
        en: "Wrong compiler version — use exactly the original one\nDifferent optimizer runs — Hardhat = 200 default, Foundry = 200 too but may be overridden\nMismatched OZ imports (minor OpenZeppelin version change)\nIncorrectly ABI-encoded constructor args — try `cast abi-encode \"constructor(...)\" arg1 arg2` (Foundry)",
      },
      {
        type: "h2",
        fr: "Vérification multi-fichiers",
        en: "Multi-file verification",
      },
      {
        type: "p",
        fr: "Pour un projet à plusieurs sources, exportez le Standard JSON Input. Avec Foundry : `forge verify-contract --watch --chain wintg --etherscan-api-key <KEY> <ADDR> <CONTRACT>`. Avec Hardhat : utilisez le plugin hardhat-etherscan en pointant l'apiURL vers https://scan.wintg.network/api/contract/verify.",
        en: "For multi-source projects, export the Standard JSON Input. With Foundry: `forge verify-contract --watch --chain wintg --etherscan-api-key <KEY> <ADDR> <CONTRACT>`. With Hardhat: use the hardhat-etherscan plugin pointing apiURL at https://scan.wintg.network/api/contract/verify.",
      },
      {
        type: "code",
        lang: "bash",
        text: `# Foundry — vérification rapide
forge verify-contract \\
  --chain-id 2280 \\
  --compiler-version v0.8.24+commit.e11b9ed9 \\
  --num-of-optimizations 200 \\
  --etherscan-api-key $WINTG_API_KEY \\
  0xYourContractAddress \\
  src/MyContract.sol:MyContract`,
      },
    ],
  },

  {
    slug: "become-validator",
    category: { fr: "Validateurs", en: "Validators" },
    title: {
      fr: "Devenir validateur sur WINTG",
      en: "Becoming a validator on WINTG",
    },
    excerpt: {
      fr: "Spécifications matérielles, candidature on-chain, bond, slashing, opérations.",
      en: "Hardware spec, on-chain candidacy, bond, slashing, operations.",
    },
    readingMinutes: 8,
    sections: [
      {
        type: "p",
        fr: "Les validateurs sécurisent la chaîne WINTG en signant les blocs. Le réseau est lancé avec un validateur unique (phase bootstrap) et un hot standby ; il s'élargira progressivement à 6, 12 puis 24 validateurs sur les deux premières années.",
        en: "Validators secure the WINTG chain by signing blocks. The network launches with a single validator (bootstrap phase) and a hot standby; it will expand progressively to 6, 12 then 24 validators over the first two years.",
      },
      {
        type: "h2",
        fr: "Pré-requis matériels",
        en: "Hardware requirements",
      },
      {
        type: "kv",
        fr: "CPU :: 8 cores modernes (AMD EPYC ou Intel Xeon)\nRAM :: 32 GB DDR4 minimum, 64 GB recommandé\nDisque :: 2 TB NVMe (le state grossit ~50 GB par an)\nRéseau :: 1 Gbps symétrique, IP statique, faible latence vers les autres validateurs\nUptime cible :: 99,9%\nSauvegarde :: clés validateur chiffrées AES-256, off-site",
        en:
          "CPU :: 8 modern cores (AMD EPYC or Intel Xeon)\nRAM :: 32 GB DDR4 minimum, 64 GB recommended\nDisk :: 2 TB NVMe (state grows ~50 GB per year)\nNetwork :: 1 Gbps symmetric, static IP, low latency to other validators\nUptime target :: 99.9%\nBackup :: validator keys encrypted AES-256, off-site",
      },
      {
        type: "h2",
        fr: "Candidature on-chain",
        en: "On-chain candidacy",
      },
      {
        type: "p",
        fr: "Le contrat ValidatorRegistry expose une fonction propose() qui prend l'adresse du candidat et un IPFS hash pointant vers son dossier (KYC, infos opérationnelles). Les validateurs actifs votent ensuite via vote(candidate, true). Une majorité 2/3 active le candidat.",
        en: "The ValidatorRegistry contract exposes a propose() function taking the candidate address and an IPFS hash pointing to their dossier (KYC, ops info). Active validators then vote via vote(candidate, true). A 2/3 majority activates the candidate.",
      },
      {
        type: "h2",
        fr: "Bond et slashing",
        en: "Bond and slashing",
      },
      {
        type: "p",
        fr: "Le validateur immobilise un bond en USD (équivalent en WTG selon le prix oracle). Le bond est slashé en cas de double-signature, de downtime prolongé (> 4 h sur 24 h) ou de censure de transactions valides. Le slashing est progressif : 1% au premier incident, 5% au deuxième, jusqu'au retrait complet.",
        en: "The validator locks a USD-denominated bond (equivalent in WTG via the price oracle). The bond is slashed on double-signing, prolonged downtime (> 4 h within 24 h) or censorship of valid transactions. Slashing is progressive: 1% on first incident, 5% on second, up to full withdrawal.",
      },
      {
        type: "h2",
        fr: "Récompenses",
        en: "Rewards",
      },
      {
        type: "p",
        fr: "Le validateur reçoit 50% des frais de transaction du réseau (au prorata du nombre de validateurs actifs) et l'inflation staking plafonnée. Avec un volume mature, un validateur peut espérer un APR de 8 à 12% en WTG sur son bond.",
        en: "Validators receive 50% of network transaction fees (pro rata of active validators) and the capped staking inflation. With mature volume, a validator can expect an 8–12% WTG APR on their bond.",
      },
      {
        type: "h2",
        fr: "Lancer un nœud",
        en: "Running a node",
      },
      {
        type: "code",
        lang: "bash",
        text: `# Démarrage Besu en mode validateur (extrait)
besu \\
  --network=wintg \\
  --rpc-http-enabled \\
  --p2p-host=$PUBLIC_IP \\
  --node-private-key-file=/etc/wintg/keys/validator.key \\
  --metrics-enabled \\
  --metrics-host=0.0.0.0 \\
  --metrics-port=9545 \\
  --logging=INFO`,
      },
      {
        type: "h2",
        fr: "Monitoring",
        en: "Monitoring",
      },
      {
        type: "p",
        fr: "Branchez Prometheus sur le port métriques de Besu et utilisez les dashboards Grafana publiés par WINTG. Mettez en place une alerte sur les blocs manqués (> 3 d'affilée), la latence p2p (> 500 ms vers la majorité des pairs) et la taille du mempool.",
        en: "Hook Prometheus to Besu's metrics port and use the Grafana dashboards published by WINTG. Set alerts on missed blocks (> 3 in a row), p2p latency (> 500 ms to a majority of peers) and mempool size.",
      },
    ],
  },

  {
    slug: "fees-and-tokenomics",
    category: { fr: "Tokenomics", en: "Tokenomics" },
    title: {
      fr: "Frais et tokenomics WTG",
      en: "WTG fees and tokenomics",
    },
    excerpt: {
      fr: "Comment les frais sont calculés, où vont les WTG collectés, modèle déflationniste.",
      en: "How fees are computed, where collected WTG flow, the deflationary model.",
    },
    readingMinutes: 6,
    sections: [
      {
        type: "p",
        fr: "WINTG suit le modèle EIP-1559 adapté à un environnement à frais ultra-faibles. Chaque transaction paie un baseFee (brûlé en partie) et un priorityFee (allant au validateur). Le minimum gasPrice du réseau est fixé à 3 gwei.",
        en: "WINTG follows the EIP-1559 model adapted to an ultra-low fee environment. Every transaction pays a baseFee (partially burned) and a priorityFee (going to the validator). The network's minimum gasPrice is set at 3 gwei.",
      },
      {
        type: "h2",
        fr: "Calcul d'un coût de transaction",
        en: "Computing a transaction cost",
      },
      {
        type: "p",
        fr: "fee = gasUsed × (baseFee + priorityFee). Pour un transfert WTG simple (21 000 gas) à 3 gwei, le coût en WTG est de 21000 × 3e-9 = 0,000063 WTG. Avec WTG à 50 CFA, ça fait environ 0,0032 CFA. Une fraction de centime.",
        en: "fee = gasUsed × (baseFee + priorityFee). For a simple WTG transfer (21 000 gas) at 3 gwei, the WTG cost is 21000 × 3e-9 = 0.000063 WTG. With WTG at 50 CFA, that's about 0.0032 CFA — a fraction of a cent.",
      },
      {
        type: "h2",
        fr: "Distribution",
        en: "Distribution",
      },
      {
        type: "p",
        fr: "Le contrat FeeDistributor reçoit la somme des frais de chaque bloc et la répartit en quatre flux atomiques :",
        en: "The FeeDistributor contract receives the sum of every block's fees and routes it through four atomic flows:",
      },
      {
        type: "ul",
        fr: "40% Treasury — financement du développement, partenariats, grants ; multisig 3-of-5\n50% Validateurs — distribué au prorata des blocs signés sur la fenêtre glissante\n5% Burn — envoyé au BurnContract qui détruit les WTG sans possibilité de récupération\n5% Communauté — bounties bug bounty, hackathons, traductions",
        en: "40% Treasury — funds development, partnerships, grants; 3-of-5 multisig\n50% Validators — distributed pro rata of blocks signed in the rolling window\n5% Burn — sent to the BurnContract which destroys WTG with no recovery path\n5% Community — bug-bounty payouts, hackathons, translations",
      },
      {
        type: "h2",
        fr: "Supply",
        en: "Supply",
      },
      {
        type: "kv",
        fr: "Supply initial :: 1 000 000 000 WTG (genesis)\nDécimales :: 18\nSupply max :: aucune borne nominale, mais l'inflation staking est plafonnée à 2% / an\nBurn :: 5% des frais → pression déflationniste qui peut excéder l'inflation",
        en:
          "Initial supply :: 1 000 000 000 WTG (genesis)\nDecimals :: 18\nMax supply :: no nominal cap, but staking inflation is capped at 2% / year\nBurn :: 5% of fees → deflationary pressure that can exceed inflation",
      },
      {
        type: "h2",
        fr: "Vesting",
        en: "Vesting",
      },
      {
        type: "p",
        fr: "Les allocations equipe, advisors, ecosystem fund et community sont sous vesting linéaire 4 ans avec cliff 1 an. Les contrats Vesting (un par bénéficiaire) sont publics et auditables sur Scan. Aucun unlock anticipé n'est possible — la fonction release() vérifie le timestamp on-chain.",
        en: "Team, advisors, ecosystem-fund and community allocations are under linear 4-year vesting with a 1-year cliff. The Vesting contracts (one per beneficiary) are public and auditable on Scan. No early unlock is possible — the release() function checks the on-chain timestamp.",
      },
    ],
  },

  {
    slug: "security-best-practices",
    category: { fr: "Sécurité", en: "Security" },
    title: {
      fr: "Bonnes pratiques de sécurité",
      en: "Security best practices",
    },
    excerpt: {
      fr: "Protéger ses clés, repérer les contrats malveillants, gérer ses approvals, éviter le phishing.",
      en: "Protect your keys, spot malicious contracts, manage your approvals, avoid phishing.",
    },
    readingMinutes: 7,
    sections: [
      {
        type: "p",
        fr: "Un wallet crypto est une cible permanente. Les attaques les plus courantes ne sont pas des « hacks » de la blockchain — elles ciblent l'utilisateur. Voici les principes que la chaîne WINTG recommande à toute personne détentrice de WTG.",
        en: "A crypto wallet is a permanent target. The most common attacks aren't « hacks » of the blockchain — they target the user. Here are the principles the WINTG chain recommends to anyone holding WTG.",
      },
      {
        type: "h2",
        fr: "Vos clés, vos cryptos",
        en: "Your keys, your crypto",
      },
      {
        type: "ul",
        fr: "Notez votre seed phrase sur papier ou métal, jamais dans un fichier numérique\nNe la photographiez pas, ne la tapez pas dans un site\nAucun support officiel WINTG ne demandera votre seed — c'est toujours une arnaque\nGardez deux copies physiques dans deux endroits différents (incendie / vol)\nPour les gros montants, utilisez un hardware wallet (Ledger, Trezor)",
        en: "Write your seed phrase on paper or metal, never in a digital file\nDon't photograph it, don't type it into a website\nNo official WINTG support will ask for your seed — it's always a scam\nKeep two physical copies in two different locations (fire / theft)\nFor large amounts, use a hardware wallet (Ledger, Trezor)",
      },
      {
        type: "h2",
        fr: "Approvals ERC-20",
        en: "ERC-20 approvals",
      },
      {
        type: "p",
        fr: "Quand vous interagissez avec un DEX, un lending protocol ou une marketplace, vous donnez l'autorisation au contrat de dépenser une certaine quantité de votre token. Beaucoup d'apps demandent un approval « infini » pour économiser une transaction. Si le contrat est compromis plus tard, l'attaquant peut vider votre solde de ce token.",
        en: "When you interact with a DEX, a lending protocol or a marketplace, you authorise the contract to spend a certain amount of your token. Many apps request an « infinite » approval to save a transaction. If the contract is compromised later, an attacker can drain your balance of that token.",
      },
      {
        type: "ul",
        fr: "Préférez un approval limité au montant exact de l'opération\nUtilisez l'outil /services/token-approvals de Scan pour lister et révoquer\nRévoquez tout approval que vous n'utilisez plus (le coût est minime)",
        en: "Prefer an approval limited to the exact amount of the operation\nUse Scan's /services/token-approvals tool to list and revoke\nRevoke any approval you no longer use (the cost is minimal)",
      },
      {
        type: "h2",
        fr: "Repérer un contrat malveillant",
        en: "Spotting a malicious contract",
      },
      {
        type: "ul",
        fr: "Code non vérifié → ne lisez pas le code, ne pouvez pas savoir ce qu'il fait\nFonction setOwner() ou transferOwnership() qui n'utilise pas Ownable2Step\nUpgradeable proxy avec un admin EOA non-multisig\nMint sans plafond, blacklist, taxe modifiable\nLe contrat n'émet pas l'event Transfer standard — incompatible avec les outils\nL'audit cité n'est pas vérifiable (lien mort, auditeur inconnu)",
        en: "Unverified code → you can't read the source, you can't know what it does\nA setOwner() or transferOwnership() that doesn't use Ownable2Step\nUpgradeable proxy with an EOA admin (non-multisig)\nMint without cap, blacklist, modifiable tax\nThe contract doesn't emit the standard Transfer event — incompatible with tooling\nA cited audit isn't verifiable (dead link, unknown auditor)",
      },
      {
        type: "h2",
        fr: "Phishing",
        en: "Phishing",
      },
      {
        type: "p",
        fr: "Vérifiez toujours le domaine. WINTG n'a qu'une famille de domaines : *.wintg.network, *.wkey.app et wintg.network. Méfiez-vous des fautes (« vvintg.network », « wintg-airdrop.xyz »). Ne signez pas une transaction dont vous ne comprenez pas le résumé. Quand un wallet affiche « unknown method », demandez avant de cliquer.",
        en: "Always check the domain. WINTG only uses one domain family: *.wintg.network, *.wkey.app and wintg.network. Watch for typos (« vvintg.network », « wintg-airdrop.xyz »). Don't sign a transaction whose summary you don't understand. When a wallet shows « unknown method », ask before clicking.",
      },
      {
        type: "h2",
        fr: "Pour les développeurs",
        en: "For developers",
      },
      {
        type: "ul",
        fr: "Toujours OpenZeppelin v5 (Ownable2Step, ReentrancyGuard, Pausable)\nTests unitaires avec couverture ≥ 95% avant tout déploiement\nNatSpec sur chaque fonction publique\nAudit externe pour tout contrat manipulant > 50 000 USD de TVL\nJamais de secrets en dur — utilisez .env et un secret manager en CI",
        en: "Always OpenZeppelin v5 (Ownable2Step, ReentrancyGuard, Pausable)\nUnit tests with ≥ 95% coverage before any deployment\nNatSpec on every public function\nExternal audit for any contract handling > USD 50 000 of TVL\nNever hard-code secrets — use .env and a CI secret manager",
      },
    ],
  },
];

export function getKbArticle(slug: string): KbArticle | undefined {
  return KB_ARTICLES.find((a) => a.slug === slug);
}
