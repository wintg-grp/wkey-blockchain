# Configuration Hyperledger Besu — WINTG

Ce dossier contient la configuration de la blockchain WINTG (Chain ID `2280`).

## ⚠️ Le fichier `genesis.json` committé est un TEMPLATE

Les adresses de validateur et de pré-allocation sont des **placeholders**.
Tu **dois** régénérer ce fichier avant tout déploiement réel via :

```bash
cd ../contracts
npm run generate-genesis -- --network mainnet
# ou: --network testnet
```

Le script `generate-genesis.ts` :

1. Lit la liste des validateurs depuis `.env`
2. Calcule les adresses `CREATE` de chaque contrat de vesting
   (`keccak256(rlp([deployer, nonce]))[12:]`) en partant de l'adresse
   du wallet déployeur (clé `DEPLOYER_ADDRESS` dans `.env`)
3. Encode l'`extraData` IBFT 2.0 (RLP de la liste des validateurs)
4. Produit le `genesis.json` final avec les bonnes pré-allocations

## Mapping des adresses placeholder

| Placeholder | Contrat / Wallet | Allocation | % |
|---|---|---:|---:|
| `0x...0a01` | `PublicSaleVesting` | 120 000 000 WTG | 12 % |
| `0x...0a02` | `PrivateSaleVesting` | 80 000 000 WTG | 8 % |
| `0x...0a03` | `TeamVesting` | 150 000 000 WTG | 15 % |
| `0x...0a04` | `AdvisorsVesting` | 30 000 000 WTG | 3 % |
| `0x...0a05` | `EcosystemVesting` | 200 000 000 WTG | 20 % |
| `0x...0a06` | `LiquidityMultisig` (Gnosis Safe) | 70 000 000 WTG | 7 % |
| `0x...0a07` | `AirdropVesting` | 80 000 000 WTG | 8 % |
| `0x...0a08` | `StakingRewardsReserve` | 150 000 000 WTG | 15 % |
| `0x...0a09` | `TreasuryVesting` | 100 000 000 WTG | 10 % |
| `0x...0a0a` | `PartnersVesting` | 20 000 000 WTG | 2 % |
| **Total** | | **1 000 000 000 WTG** | **100 %** |

Le validateur placeholder dans `extraData` est `0x1111…1111`.

## Pré-financement du déployeur

Pour déployer les contrats à leurs adresses pré-calculées, le wallet
déployeur a besoin d'un peu de WTG pour le gas. Deux options gérées par
`generate-genesis.ts` :

- **Option A** (par défaut) : ajoute une petite allocation au déployeur
  (par défaut `10 000 WTG`) **prélevée sur la tranche Liquidity** pour
  garder le total à 1 milliard exactement.
- **Option B** (`--no-prefund-deployer`) : pas d'allocation au déployeur ;
  le multisig Liquidity transfère manuellement post-genesis.

## Choix techniques du genesis

- **`chainId: 2280`** — mainnet WINTG (testnet : `22800`).
- **`ibft2`** :
  - `blockperiodseconds: 3` — un bloc toutes les 3 secondes
  - `epochlength: 30000` — réinitialisation des votes tous les 30 000 blocs
  - `requesttimeoutseconds: 4` — timeout du round IBFT
  - `blockreward: 0x0` — **pas d'inflation** au niveau du protocole
    (la réserve staking est gérée en phase 2 par contrat dédié)
- **`zeroBaseFee: true`** — désactive le burn EIP-1559. Toutes les fees
  vont au coinbase, qui doit être configuré sur l'adresse du
  `FeeDistributor` au niveau de chaque validateur (`miner-coinbase`).
  Le `FeeDistributor` répartit ensuite 70 % Treasury / 20 % Validateurs / 10 % Burn.
- **`gasLimit: 0x1c9c380` (30 000 000)** — soit ~1000 TPS théorique avec
  des transferts simples (~21k gas).
- **Hard forks** : tous activés au bloc 0 (Homestead → Cancun) pour
  bénéficier de la full EVM moderne (PUSH0, transient storage, etc.).
- **`mixHash`** : valeur magique IBFT 2.0 standard de Besu.

## Fichiers

| Fichier | Rôle |
|---|---|
| `genesis.json` | Bloc Genesis (template — à régénérer avant lancement) |
| `config.toml` | Config du validateur principal |
| `config-standby.toml` | Config du hot standby (à produire) |
| `config-rpc.toml` | Config du nœud RPC public (à produire) |
| `permissions_config.toml` | Liste des validateurs autorisés (à produire) |
| `static-nodes.json` | Bootnodes du réseau (à produire) |

## Vérifier le genesis avant de lancer

```bash
# Vérifier la structure JSON
jq . besu/genesis.json > /dev/null && echo "JSON valide"

# Vérifier le total des allocations (doit être 1e27 wei = 1 000 000 000 WTG)
jq '[.alloc[].balance | tonumber] | add' besu/genesis.json
# → 1e+27

# Démarrage local en mode dev pour test
besu --data-path=/tmp/wintg-test \
     --genesis-file=besu/genesis.json \
     --network-id=2280 \
     --rpc-http-enabled
```

## Régénérer l'`extraData` à la main (si besoin)

L'`extraData` IBFT 2.0 encode en RLP la liste des validateurs initiaux.
Format :

```
RLP([
  vanity (32 bytes de zéros),
  [adresse_validateur_1, adresse_validateur_2, ...],
  []   // vote vide (genesis)
  0    // round = 0
  []   // seals vides (genesis)
])
```

Tu peux utiliser la commande Besu intégrée :

```bash
echo '["0xVOTRE_ADRESSE_VALIDATEUR"]' > /tmp/validators.json
besu rlp encode --type=IBFT_EXTRA_DATA --from=/tmp/validators.json
```

Ou utiliser le helper inclus dans `contracts/scripts/generate-genesis.ts`.
