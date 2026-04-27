# Architecture technique — WINTG

## 1. Vue d'ensemble

WINTG est une blockchain Layer 1 EVM-compatible (Hyperledger Besu, IBFT 2.0) conçue pour le marché UEMOA. Architecture en couches :

1. **Couche infrastructure** — validateur principal + hot standby + nœud RPC public
2. **Couche protocole** — IBFT 2.0 (PoA), block time 3 s, finalité instantanée
3. **Couche économique** — token natif WTG + 13 smart contracts (vesting, treasury, fees, burn, wrapper)
4. **Couche observabilité** — Prometheus, Grafana, Loki, Alertmanager
5. **Couche utilisateur** — Block explorer (Blockscout), RPC HTTPS / WSS, wallets (MetaMask)

## 2. Topologie réseau

```
                                Internet
                                   │
                     ┌─────────────┴─────────────┐
                     │  Cloudflare (DDoS / WAF)  │
                     └─────────────┬─────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     │   Nginx (TLS, rate limit) │
                     └──────┬─────────┬──────────┘
                            │         │
                ┌───────────▼──┐  ┌───▼─────────┐
                │ Nœud RPC     │  │ Blockscout  │
                │ public       │  │ (PostgreSQL │
                │ (Besu)       │  │  + Redis)   │
                │ port 8545/46 │  │ port 4000   │
                └──────┬───────┘  └─────┬───────┘
                       │                │
                       │                │
        ┌──────────────▼──────┬─────────▼──────────┐
        │     Réseau P2P privé Besu (IBFT 2.0)     │
        │       enode://... port 30303 TCP/UDP     │
        └──┬───────────────────────────────────┬───┘
           │                                   │
   ┌───────▼──────────┐               ┌────────▼─────────┐
   │ Validateur       │               │ Hot Standby      │
   │ primaire         │               │ (full node)      │
   │ - clé Vault/KMS  │               │ - prêt à promouv │
   │ - mining auto    │               │ - sync continu   │
   │ - backups H/24   │               │ - bascule script │
   └───────┬──────────┘               └────────┬─────────┘
           │                                   │
           └───────────────┬───────────────────┘
                           │   metrics :9545
                ┌──────────▼──────────────────┐
                │   Stack Monitoring (Docker) │
                │  - Prometheus (scrape 15s)  │
                │  - Grafana (dashboards)     │
                │  - Loki (logs)              │
                │  - Alertmanager → Telegram  │
                └─────────────────────────────┘
```

## 3. Spécifications hardware

| Rôle | vCPU | RAM | Disque | Réseau |
|---|---:|---:|---|---|
| Validateur primaire | 8 | 16 GB | 200 GB SSD NVMe | 1 Gbps, low-latency |
| Hot standby | 8 | 16 GB | 200 GB SSD NVMe | 1 Gbps |
| Nœud RPC public | 8 | 24 GB | 500 GB SSD NVMe | 1 Gbps |
| Blockscout | 4 | 8 GB | 200 GB SSD | 100 Mbps |
| Monitoring | 2 | 4 GB | 100 GB SSD | 100 Mbps |

> Prévoir 30 % de marge sur disque et RAM pour la croissance de la chaîne.

## 4. Flux des transactions

```
1. Utilisateur signe une tx via wallet (MetaMask / WKey)
2. Tx envoyée à https://rpc.wintg.network (RPC public)
3. Nœud RPC public propage via P2P → validateur primaire
4. Validateur primaire :
   a. Inclut la tx dans son bloc proposé
   b. Diffuse la proposition aux autres validateurs IBFT
   c. (Phase bootstrap : 1 seul validateur, donc auto-acceptation)
5. Bloc finalisé en 1 round IBFT (~1 s)
6. Hot standby reçoit le bloc via P2P et l'applique à son state
7. Blockscout indexe le bloc (RPC eth_getBlockByNumber)
8. Frais de la tx :
   a. Coinbase = adresse EOA du validateur
   b. Keeper externe transfère périodiquement → FeeDistributor
   c. FeeDistributor split 40 % Treasury / 50 % Validateurs / 5 % Burn / 5 % CommunityPool
```

## 5. Stack logicielle

| Composant | Version | Rôle |
|---|---|---|
| Hyperledger Besu | 26.4.0 | Client Ethereum / IBFT 2.0 |
| OpenJDK | 21 LTS | Runtime Besu |
| Solidity | 0.8.24 | Smart contracts |
| OpenZeppelin Contracts | 5.x | Bibliothèque sécurisée |
| Hardhat | 2.22+ | Build, test, deploy |
| Foundry (forge) | latest | Tests fuzz |
| Blockscout | latest | Block explorer |
| PostgreSQL | 16 | DB Blockscout |
| Redis | 7 | Cache Blockscout |
| Prometheus | latest | Métriques |
| Grafana | latest | Dashboards |
| Alertmanager | latest | Routing alertes |
| Loki + Promtail | latest | Agrégation logs |
| Nginx | latest | Reverse proxy + TLS |
| Cloudflare | — | DDoS, CDN, WAF |
| Let's Encrypt | — | Certificats TLS |

## 6. Plan d'évolution validateurs

```
T0 (lancement)
  └── 1 validateur primaire WINTG + 1 hot standby

T+6 mois (Phase 2)
  ├── Validateur primaire WINTG (existant)
  ├── Hot standby WINTG (existant)
  ├── Validateur UCAO (université)
  └── Validateur partenaire institutionnel

T+12 mois (Phase 3)
  └── 7 validateurs (ajout BCEAO + 2 banques)

T+24 mois (Phase 4)
  └── 13+ validateurs (DAO ouverte aux partenaires UEMOA)
```

Procédure d'ajout : `scripts/add-validator.sh <0x...>`. Voir [`VALIDATOR_GUIDE.md`](./VALIDATOR_GUIDE.md).

## 7. Modèle de menace (résumé)

| Vecteur | Mitigation |
|---|---|
| Compromission clé validateur | Vault / KMS + chiffrement AES-256 + rotation 6 mois |
| DDoS sur RPC public | Cloudflare + Nginx rate limit + multiple nœuds RPC |
| Attaque 51% | Phase bootstrap : assumée. Phase 2+ : ≥4 validateurs distincts juridiquement |
| Slashing-style frame | IBFT 2.0 ne supporte pas le slashing ; éviction par vote multipartite |
| Bug smart contract | Coverage ≥ 95 %, Slither, Mythril, Echidna, audit externe pré-mainnet |
| Drain Treasury | Multisig 2-of-3 → 3-of-5, timelock optionnel |
| Drain Staking Reserve | Rate limit on-chain 1 %/jour |

Détails complets : [`SECURITY.md`](./SECURITY.md).
