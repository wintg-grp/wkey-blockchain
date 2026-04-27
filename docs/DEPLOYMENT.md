# Guide de déploiement WINTG

## Vue d'ensemble — séquence complète

```
┌──────────────────────────────────────────────────────────────┐
│ PHASE A — PRÉPARATION                                        │
│  1. Provisionner les serveurs (Hetzner / OVH)                │
│  2. Générer les wallets (deployer, validateurs, multisig)    │
│  3. Régénérer le genesis avec les bonnes adresses            │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│ PHASE B — INFRASTRUCTURE                                      │
│  4. Bootstrap validateur primaire (./scripts/setup-validator.sh)│
│  5. Bootstrap hot standby (./scripts/setup-standby.sh)       │
│  6. Bootstrap nœud RPC public (./scripts/setup-rpc.sh)       │
│  7. Stack monitoring (Prometheus / Grafana / Alertmanager)   │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│ PHASE C — SMART CONTRACTS                                    │
│  8. Compiler + tester (≥ 95 % coverage)                       │
│  9. Audit Slither / Mythril / Echidna                         │
│ 10. Déployer (npm run deploy:testnet → mainnet)              │
│ 11. Vérifier les sources sur Blockscout                       │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│ PHASE D — TGE                                                │
│ 12. Set allocations Public/Private (lots) → finalize          │
│ 13. Publish Merkle root Airdrop                               │
│ 14. Communication publique                                    │
└──────────────────────────────────────────────────────────────┘
```

## Phase A — Préparation

### A.1 Serveurs (Hetzner ou OVH recommandé pour latence Afrique de l'Ouest)

| Hostname | Type | Spec | Usage |
|---|---|---|---|
| `validator-01.wintg.network` | CCX23 | 8 vCPU / 32 GB / 240 GB SSD | Validateur primaire |
| `standby-01.wintg.network` | CCX23 | 8 vCPU / 32 GB / 240 GB SSD | Hot standby |
| `rpc-01.wintg.network` | CCX33 | 8 vCPU / 32 GB / 480 GB SSD | RPC public |
| `scan.wintg.network` | CX52 | 4 vCPU / 16 GB / 240 GB SSD | Blockscout |
| `monitor.wintg.network` | CX22 | 2 vCPU / 4 GB / 80 GB SSD | Prometheus + Grafana |

OS : Ubuntu 22.04 LTS minimal. Accès SSH par clé uniquement.

### A.2 Génération des wallets

Sur une **machine offline** :

```bash
cd contracts
npx ts-node scripts/generate-wallets.ts
# → wallets.encrypted.json (chiffré AES-256-GCM)
```

11 wallets générés : `deployer`, `validator-primary`, `validator-standby`,
3× `treasury-signer`, 4× `*-beneficiary`, `validator-pool`.

> **Sauvegarder** `wallets.encrypted.json` dans 3 emplacements distincts.
> La passphrase n'est PAS stockée — la perdre = perdre les fonds.

### A.3 Variables d'environnement

```bash
cp .env.example .env
# Remplir :
#   DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY
#   VALIDATORS=<addr_validateur_primaire>
#   LIQUIDITY_MULTISIG_ADDRESS=<addr>
#   TREASURY_SIGNERS=<addr1>,<addr2>,<addr3>
#   TREASURY_THRESHOLD=2
```

### A.4 Régénérer le genesis

```bash
cd contracts
npm install
npm run generate-genesis -- --network mainnet
# → besu/genesis.json mis à jour avec les vraies adresses
```

Vérifier :

```bash
node -e "
const g = require('./besu/genesis.json');
console.log('chainId :', g.config.chainId);
console.log('total alloc :', Object.values(g.alloc).reduce((s, a) => s + BigInt(a.balance), 0n) / 10n**18n, 'WTG');
"
# → chainId : 2280
# → total alloc : 1000000000 WTG
```

## Phase B — Infrastructure

### B.1 Validateur primaire

```bash
ssh root@validator-01.wintg.network
git clone https://github.com/wintg-grp/wkey-blockchain.git /opt/wintg
cd /opt/wintg
sudo ./scripts/setup-validator.sh mainnet
```

Le script :

- installe Java 21, Besu 26.4.0, fail2ban, ufw
- crée user `besu`
- copie configs dans `/etc/besu/`
- génère la clé validateur (si absente)
- crée le service systemd
- ouvre les ports 22, 30303 (TCP/UDP)
- démarre Besu

Vérifier :

```bash
sudo systemctl status besu
sudo journalctl -u besu -f
./scripts/health-check.sh
```

### B.2 Hot standby

```bash
ssh root@standby-01.wintg.network
git clone ... && cd /opt/wintg
sudo ./scripts/setup-standby.sh mainnet
```

Vérifier sync : `eth_syncing` doit passer de `true` à `false` en quelques heures.

### B.3 Nœud RPC public

```bash
ssh root@rpc-01.wintg.network
sudo ./scripts/setup-rpc.sh mainnet

# Première fois — Certbot HTTPS
sudo certbot --nginx -d rpc.wintg.network -d ws.wintg.network \
  --non-interactive --agree-tos -m admin@wintg.group
```

### B.4 Monitoring

```bash
ssh root@monitor.wintg.network
git clone ... && cd /opt/wintg/monitoring
cp .env.example .env
# Éditer .env (passwords + Telegram token)
docker compose up -d
```

UI Grafana : `http://monitor.wintg.network:3000` (admin / cf .env).

## Phase C — Smart contracts

### C.1 Tests + couverture

```bash
cd contracts
npm test
npm run coverage
# Cible : ≥ 95 % statements et branches
```

### C.2 Audit local

```bash
# Slither
docker run -v $PWD:/src trailofbits/slither /src

# Mythril
docker run -v $PWD:/src mythril/myth analyze /src/contracts/src/**/*.sol

# Echidna (fuzzing 24h)
echidna-test contracts/src/vesting/VestingVault.sol --config echidna.yml
```

### C.3 Déploiement

```bash
# Dry-run d'abord
npx hardhat run scripts/deploy.ts --network wintgMainnet -- --dry-run

# Réel
npm run deploy:mainnet
```

Le script vérifie que les adresses CREATE matchent les pré-allocations
genesis. En cas de mismatch : abort.

Output :

```
deployments/wintgMainnet.json   ← adresses + args constructeur
deployments/wintgMainnet.md     ← rapport markdown
```

### C.4 Vérification Blockscout

Si `BLOCKSCOUT_API_URL` est défini, `deploy.ts` vérifie automatiquement.
Sinon :

```bash
npx hardhat run scripts/verify.ts --network wintgMainnet
```

## Phase D — TGE

### D.1 Allocations Public/Private Sale

```bash
# Lots de buyers (CSV : address,amount_wtg)
npx hardhat run scripts/set-public-sale-allocations.ts --network wintgMainnet
npx hardhat run scripts/set-private-sale-allocations.ts --network wintgMainnet

# Une fois toutes les allocations entrées :
# (transaction multisig Treasury → finalize)
```

### D.2 Airdrop Merkle root

```bash
# Générer la merkle tree à partir d'un CSV
npx ts-node scripts/build-merkle-airdrop.ts < airdrop_list.csv > merkle.json

# Déployer le root (set au constructeur, donc à la déploy phase C.3)
```

### D.3 Communication

- Publier `besu/genesis.json` final + adresses sur GitHub
- Annoncer chainID, RPC, explorer sur le site / Twitter / Discord
- Configurer MetaMask :
  - Network Name: `WINTG Mainnet`
  - RPC URL: `https://rpc.wintg.network`
  - Chain ID: `2280`
  - Symbol: `WTG`
  - Block Explorer: `https://scan.wintg.network`

## Procédures d'urgence

| Incident | Procédure |
|---|---|
| Validateur primaire down | `./scripts/promote-standby.sh` (sur standby) |
| Disque plein | Étendre LVM / volume cloud → redémarrer Besu |
| Compromission clé validateur | Rotation immédiate via vote IBFT (phase 2+) ; phase 1 = scénario catastrophe (régénérer genesis) |
| Drain Treasury | Pause + révoquer signataires multisig |
| Bug critique smart contract | Pause via `Pausable` (déjà sur tous les contrats) → patch → migrate |

Voir [`SECURITY.md`](./SECURITY.md) pour les détails complets.
