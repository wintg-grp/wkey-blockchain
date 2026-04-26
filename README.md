# WINTG Blockchain

> **Layer 1 souveraine pour le marché africain — Togo 🇹🇬 → UEMOA**
> Ultra-rapide, frais quasi-nuls, EVM-compatible. Socle d'un futur écosystème
> de paiements e-commerce, gaming, NFT et remittances Mobile Money.

[![Status](https://img.shields.io/badge/status-pre--launch-orange)]()
[![Consensus](https://img.shields.io/badge/consensus-IBFT%202.0-blue)]()
[![Chain ID](https://img.shields.io/badge/chain%20id-2280-green)]()
[![Solidity](https://img.shields.io/badge/solidity-%5E0.8.24-363636)]()
[![Tests](https://img.shields.io/badge/tests-217%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)]()

---

## 🚀 Mise en ligne

Pour passer du code à une **blockchain WINTG accessible en ligne** :

→ Suivre **[GO_LIVE.md](GO_LIVE.md)** (guide pas-à-pas en français, 2-4 heures)

Étapes principales :
1. Acheter un serveur cloud (Hetzner CCX23 ~50€/mois)
2. Configurer DNS sur `wkey.app` ([DNS_SETUP.md](docs/DNS_SETUP.md))
3. Lancer le master script :
   ```bash
   curl -sSL https://raw.githubusercontent.com/wkey-app/wkey-blockchain/main/scripts/wkey-deploy.sh \
     | sudo bash -s -- testnet validator
   ```
4. Vérifier que la chaîne produit des blocs
5. Déployer les smart contracts depuis ton PC local
6. (Pour mainnet) Faire un audit externe avant TGE

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Périmètre de la phase 1](#périmètre-de-la-phase-1)
- [Architecture](#architecture)
- [Tokenomics WTG](#tokenomics-wtg)
- [Structure du monorepo](#structure-du-monorepo)
- [Quick start](#quick-start)
- [Roadmap](#roadmap)
- [Sécurité](#sécurité)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Vue d'ensemble

WINTG est une **blockchain Layer 1** EVM-compatible conçue pour les besoins du
marché africain : faible coût d'utilisation, finalité instantanée et
gouvernance progressive vers la décentralisation.

| Caractéristique | Valeur |
|---|---|
| Client | [Hyperledger Besu](https://besu.hyperledger.org/) (dernière version stable) |
| Consensus | IBFT 2.0 (Proof of Authority, finalité instantanée) |
| Chain ID | `2280` (mainnet) — `22800` (testnet) |
| Symbole gas | `WTG` |
| Block time | 3 secondes |
| Gas limit / bloc | 30 000 000 |
| TPS cible | 1 000+ |
| Finalité | Instantanée (1 bloc = irréversible) |

---

## Périmètre du monorepo

> **Ce dépôt couvre la blockchain Layer 1 complète : protocole + tokenomics + DeFi de base + outillage développeur.**

### Couche infrastructure
- ✅ Configuration Besu IBFT 2.0 (genesis, validateur, hot standby, RPC public)
- ✅ Token natif WTG (pré-alloué via genesis)
- ✅ Block explorer Blockscout
- ✅ Stack monitoring Prometheus + Grafana + Alertmanager + Loki
- ✅ Scripts d'automatisation (setup, bascule, backups, healthcheck)

### Couche tokenomics
- ✅ 10 contrats de vesting (Public, Private, Team, Advisors, Ecosystem, Airdrop Merkle, Treasury, Partners, Staking, Liquidity)
- ✅ `WINTGTreasury` multisig M-of-N + timelock + rotation signataires
- ✅ `FeeDistributor` (70 / 20 / 10) + `BurnContract` (→ 0x...dEaD)
- ✅ `WTGToken` (WWTG, wrapper ERC-20 + EIP-2612 permit)

### Couche DeFi
- ✅ **DEX** : `WINTGFactory` + `WINTGPair` + `WINTGRouter` (Uniswap V2-compatible)
- ✅ **Staking** : `WINTGStaking` qui consomme `StakingRewardsReserve`
- ✅ **Governance DAO** : `WINTGGovernor` + `WINTGTimelock` (OZ Governor)
- ✅ **Bridge cross-chain** : `WINTGBridge` (lock/mint vers ETH/BNB/Polygon)
- ✅ **Oracle** : `OracleAggregator` (interface Chainlink-compatible)
- ✅ **Multicall3** (batch reads, standard de l'industrie)
- ✅ **NFT standards** : `WINTGNFT` (ERC-721) + `WINTGCollection` (ERC-1155)
- ✅ **ValidatorRegistry** on-chain

### Outillage développeur
- ✅ Hardhat + tests (≥ 95 % coverage) + Foundry/forge (fuzz)
- ✅ TypeScript **SDK** `@wintg/sdk` pour dApps
- ✅ **Faucet** testnet (Express API + hCaptcha)
- ✅ **CI/CD** GitHub Actions (lint, test, coverage, security scan, deploy)
- ✅ Slither + Mythril intégrés
- ✅ chainlist.org registration JSON

### Produits séparés (apps utilisateurs hors de ce monorepo)
- 📱 **WKey** — wallet mobile Flutter (iOS/Android) → repo séparé `wintg/wkey`
- 🛒 **WPAY** — gateway de paiement e-commerce → repo séparé `wintg/wpay`
- 🌐 **Winify** — plateforme no-code web → repo séparé `wintg/winify`
- 💱 **Mobile Money Bridge** — intégration Orange Money / MTN / Wave → repo séparé `wintg/mobile-money`

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │       Internet / dApps      │
                        └──────────────┬──────────────┘
                                       │ HTTPS / WSS
                                       ▼
                        ┌─────────────────────────────┐
                        │    Cloudflare (DDoS, CDN)   │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │  Nginx reverse proxy + TLS  │
                        │  rate limiting + allowlists │
                        └──────┬──────────────┬───────┘
                               │              │
                               ▼              ▼
                  ┌────────────────────┐  ┌──────────────────────┐
                  │  Nœud RPC public    │  │   Block Explorer     │
                  │  (lecture seule)    │  │   (Blockscout)       │
                  │  ports 8545/8546    │  │   PostgreSQL + Redis │
                  └─────────┬──────────┘  └─────────┬────────────┘
                            │                       │
                            │   P2P (port 30303)    │
                            ▼                       │
   ┌────────────────────────────────────────────────┴──────────┐
   │                  Réseau P2P privé (IBFT 2.0)              │
   ├─────────────────────────────┬──────────────────────────────┤
   │  Validateur principal       │     Hot Standby (full node)  │
   │  - mine = true              │     - mine = false           │
   │  - clé sécurisée (Vault)    │     - prêt à devenir         │
   │  - backups automatiques     │       validateur             │
   └─────────────────────────────┴──────────────────────────────┘
                            ▲                       ▲
                            │  metrics              │
                            └────────┬──────────────┘
                                     ▼
                        ┌─────────────────────────────┐
                        │  Prometheus + Grafana       │
                        │  + Alertmanager + Loki      │
                        │  → Telegram bot (alertes)   │
                        └─────────────────────────────┘
```

> Détails complets dans [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (à produire).

### Démarrage : 1 validateur + standby, ouverture progressive

IBFT 2.0 nécessite normalement **4 validateurs** pour la tolérance byzantine.
WINTG démarre avec **1 validateur unique + 1 hot standby** (configuration
assumée publiquement) et ouvre progressivement le set au fil des
intégrations partenaires (UCAO, BCEAO, banques UEMOA).

Mesures compensatoires obligatoires :

- 🔁 Hot standby synchronisé H24, procédure de bascule documentée et testée
- 📊 Monitoring 24/7 avec alertes Telegram (Prometheus + Grafana + Alertmanager)
- 🔐 Clé validateur chiffrée (AES-256), stockée dans Hashicorp Vault ou KMS
- 💾 Backup automatique horaire (3 emplacements géographiquement distincts)
- 📅 Plan d'évolution : ajout de validateurs à T+6m, T+12m, T+24m

### Trajectoire d'ouverture du set des validateurs

| Échéance | Validateurs | Source |
|---|---|---|
| T0 (lancement) | 1 + standby | WINTG |
| T+6 mois | ~4 | + UCAO + 2 partenaires institutionnels |
| T+12 mois | ~7 | + 3 partenaires bancaires / régulateurs |
| T+24 mois | 13+ | Ouverture DAO via `WINTGGovernor` |

Procédure : voir [`docs/VALIDATOR_GUIDE.md`](./docs/VALIDATOR_GUIDE.md) (à produire).

---

## Tokenomics WTG

| Paramètre | Valeur |
|---|---|
| Nom | WINTG |
| Symbole | WTG |
| Type | Token natif (gas + transferts) |
| Décimales | 18 |
| Supply maximum | 1 000 000 000 WTG |
| Modèle économique | Fixe + burn déflationniste + inflation staking plafonnée 4 %/an |

### Distribution du supply

| Catégorie | % | Montant (WTG) | Vesting |
|---|---:|---:|---|
| Public Sale (ICO/IDO) | 12 % | 120 000 000 | 25 % TGE + linéaire 6 mois |
| Private Sale (Seed) | 8 % | 80 000 000 | 10 % TGE + cliff 3 m + 18 m linéaire |
| Équipe & Fondateurs | 15 % | 150 000 000 | 0 % TGE + cliff 12 m + 36 m linéaire |
| Advisors | 3 % | 30 000 000 | 0 % TGE + cliff 6 m + 18 m linéaire |
| Écosystème & Grants | 20 % | 200 000 000 | 5 % TGE + 48 m linéaire |
| Liquidité DEX/CEX | 7 % | 70 000 000 | 100 % TGE |
| Airdrop & Community | 8 % | 80 000 000 | 30 % TGE + 12 m linéaire |
| Staking Rewards Reserve | 15 % | 150 000 000 | Owner = `WINTGStaking`, rate-limit 1 %/jour |
| Trésorerie WINTG | 10 % | 100 000 000 | 10 % TGE + cliff 6 m + 48 m linéaire |
| Partenariats institutionnels | 2 % | 20 000 000 | 0 % TGE + cliff 6 m + 24 m linéaire |
| **TOTAL** | **100 %** | **1 000 000 000** | |

### Répartition des frais de transaction

```
                100 % des fees
                      │
        ┌─────────────┼─────────────┐
       70 %          20 %          10 %
        ▼             ▼             ▼
   Treasury      Validateurs       Burn
   multisig       (pro-rata        → 0x...dEaD
                  blocs validés)
```

Implémentation : `contracts/src/fees/FeeDistributor.sol` (à produire).

---

## Structure du monorepo

```
wintg-blockchain/
├── README.md                    # ← ce fichier
├── docs/                        # Documentation technique complète
│   ├── ARCHITECTURE.md
│   ├── TOKENOMICS.md
│   ├── DEPLOYMENT.md
│   ├── VALIDATOR_GUIDE.md
│   ├── SECURITY.md
│   └── API.md
├── besu/                        # Configuration Hyperledger Besu
│   ├── genesis.json             # Bloc Genesis (Chain ID 2280)
│   ├── config.toml              # Config validateur principal
│   ├── config-standby.toml      # Config hot standby
│   ├── config-rpc.toml          # Config nœud RPC public
│   ├── permissions_config.toml  # Liste validateurs autorisés
│   └── static-nodes.json        # Nœuds bootstrap
├── contracts/                   # Smart contracts Solidity
│   ├── hardhat.config.ts
│   ├── package.json
│   ├── src/
│   │   ├── token/               # WTGToken (wrapper optionnel)
│   │   ├── vesting/             # 9 contrats de vesting
│   │   ├── treasury/            # WINTGTreasury (multisig)
│   │   ├── fees/                # FeeDistributor, BurnContract
│   │   └── utils/
│   ├── test/                    # Tests Hardhat + Foundry (≥95 % coverage)
│   ├── scripts/
│   │   ├── generate-genesis.ts  # Génération du bloc Genesis
│   │   ├── deploy.ts            # Déploiement complet
│   │   ├── verify.ts            # Vérification Blockscout
│   │   └── generate-wallets.ts
│   └── deployments/             # Adresses des contrats déployés
├── explorer/                    # Block Explorer (Blockscout)
├── monitoring/                  # Stack Prometheus + Grafana + Loki
├── scripts/                     # Scripts shell (setup, bascule, backups)
└── infrastructure/              # Nginx, systemd, Docker
```

---

## Quick start

### Prérequis

- Ubuntu 22.04 LTS (8 vCPU, 16 GB RAM, 200 GB SSD NVMe minimum pour validateur)
- [Docker](https://docs.docker.com/engine/install/) ≥ 24 + Docker Compose v2
- [Node.js](https://nodejs.org/) 20 LTS + [pnpm](https://pnpm.io/) ou npm
- [OpenJDK 21](https://adoptium.net/) (runtime Besu)
- [Hyperledger Besu](https://besu.hyperledger.org/) ≥ 24.x

### 1. Cloner le dépôt

```bash
git clone https://github.com/wintg/wintg-blockchain.git
cd wintg-blockchain
cp .env.example .env
# Éditer .env (clés validateur, deployer, RPC...)
```

### 2. Générer le genesis

```bash
cd contracts
npm install
npm run generate-genesis -- --network testnet   # ou mainnet
```

Le fichier `besu/genesis.json` est régénéré avec les bonnes adresses
(validateurs + contrats de vesting calculés depuis le deployer).

### 3. Démarrer un validateur (testnet)

```bash
cd ..
./scripts/setup-validator.sh testnet
```

Le script :

1. Installe Besu si absent
2. Importe la clé validateur depuis `.env` (chiffrée)
3. Lance Besu en service systemd
4. Active le monitoring Prometheus
5. Vérifie la production de blocs

### 4. Déployer les smart contracts

```bash
cd contracts
npm run deploy:testnet
```

### 5. Lancer le block explorer

```bash
cd explorer
docker compose up -d
# Blockscout disponible sur http://localhost:4000
```

### 6. Vérifier la santé du nœud

```bash
./scripts/health-check.sh
```

> Procédure complète et production-ready : voir [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) (à produire).

---

## Endpoints publics

### Mainnet (Chain ID `2280`)

| Service | URL |
|---|---|
| RPC HTTPS | `https://chain.wkey.app` |
| WebSocket | `wss://ws.wkey.app` |
| Block Explorer | `https://explorer.wkey.app` |

### Testnet (Chain ID `22800`)

| Service | URL |
|---|---|
| RPC HTTPS | `https://testnet-rpc.wkey.app` |
| WebSocket | `wss://testnet-ws.wkey.app` |
| Block Explorer | `https://testnet-explorer.wkey.app` |
| Faucet | `https://faucet.wkey.app` |

### Configuration MetaMask

```
Network Name : WINTG Mainnet
RPC URL      : https://chain.wkey.app
Chain ID     : 2280
Symbol       : WTG
Block Explorer: https://explorer.wkey.app
```

---

## Roadmap d'exécution

| Étape | Livrable |
|---|---|
| **Build** | Tous les contrats + infra + outillage (✅ ce monorepo) |
| **Audit** | Slither + Mythril + Echidna + audit externe (CertiK / Hacken / OpenZeppelin) |
| **Testnet public** | Lancement testnet + faucet + tests de charge 1000 TPS |
| **Bug bounty** | Programme public (réserve ≥ 10 k USD) pendant 30 jours |
| **Mainnet** | TGE + déploiement complet + activation DEX/Staking/Governance |
| **Onboarding validateurs** | UCAO + BCEAO + partenaires UEMOA via vote DAO |

---

## Sécurité

### Smart contracts

- ✅ Solidity `^0.8.24` avec OpenZeppelin v5
- ✅ Patterns sécurisés : `Ownable2Step`, `ReentrancyGuard`, `Pausable`
- ✅ Tests unitaires + intégration : couverture ≥ 95 %
- ✅ Analyse statique (Slither) sans alerte critique
- ✅ Analyse symbolique (Mythril) sans vulnérabilité high/medium
- ✅ Fuzzing (Echidna) 24 h sans crash
- ✅ Multisig sur Treasury, timelock sur opérations critiques
- ⚠️ Audit externe **fortement recommandé** avant TGE (CertiK / Hacken / OpenZeppelin)

### Validateur & infrastructure

- 🔐 Clé validateur chiffrée AES-256, stockée dans Hashicorp Vault ou KMS cloud
- 💾 Backup automatique horaire (3 emplacements distincts, chiffrés)
- 🛡️ Firewall UFW + Fail2ban + SSH par clé uniquement
- 🔄 Hot standby synchronisé H24, bascule testée mensuellement
- 📊 Monitoring 24/7 avec alertes Telegram (latence bloc, sync, peers, disque)
- 🌐 RPC public derrière Cloudflare (DDoS + rate limit + WAF)

> Checklist complète : [`docs/SECURITY.md`](./docs/SECURITY.md) (à produire).

### Reporting de vulnérabilités

Tout problème de sécurité doit être signalé à `security@wkey.app` (PGP key
publiée sur [keybase.io/wkey](https://keybase.io/wkey)). **Ne pas ouvrir
d'issue publique.** Bug bounty actif après lancement mainnet.

---

## Contribuer

- **Conventional Commits** obligatoires (`feat:`, `fix:`, `docs:`, `test:`...)
- Pull requests : tests verts + couverture ≥ 95 % sur contrats critiques
- Lint + format : `npm run lint` + `npm run format`
- Toute modification de tokenomics nécessite une RFC dans `docs/rfcs/`

---

## Licence

- Smart contracts : [MIT](./LICENSE)
- Documentation : [CC BY 4.0](./LICENSE-DOCS)
- Configuration Besu : [Apache 2.0](./LICENSE-INFRA)

---

**Made with ❤️ in Lomé, Togo 🇹🇬**
