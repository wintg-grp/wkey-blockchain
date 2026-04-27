# Tokenomics WTG

## Identité

| Paramètre | Valeur |
|---|---|
| Nom | WINTG |
| Symbole | WTG |
| Type | Token natif (gas + transferts on-chain) |
| Décimales | 18 |
| Supply maximum | **1 000 000 000 WTG** |
| Modèle économique | Fixe + burn déflationniste + inflation staking plafonnée |
| Inflation maximale | 4 %/an (gérée par contrat de staking en phase 2) |

## Distribution (1 000 000 000 WTG)

| # | Catégorie | % | Montant (WTG) | Vesting | Contrat |
|---:|---|---:|---:|---|---|
| 1 | Public Sale (ICO/IDO) | 12 % | 120 000 000 | 25 % TGE + 6 m linéaire | `PublicSaleVesting` |
| 2 | Private Sale (Seed) | 8 % | 80 000 000 | 10 % TGE + cliff 3 m + 18 m linéaire | `PrivateSaleVesting` |
| 3 | Équipe & Fondateurs | 15 % | 150 000 000 | 0 % TGE + cliff 12 m + 36 m linéaire | `TeamVesting` |
| 4 | Advisors | 3 % | 30 000 000 | 0 % TGE + cliff 6 m + 18 m linéaire | `AdvisorsVesting` |
| 5 | Écosystème & Grants | 20 % | 200 000 000 | 5 % TGE + 48 m linéaire | `EcosystemVesting` |
| 6 | Liquidité DEX/CEX | 7 % | 70 000 000 | 100 % TGE | Multisig dédié |
| 7 | Airdrop & Community | 8 % | 80 000 000 | 30 % TGE + 12 m linéaire | `AirdropVesting` (Merkle) |
| 8 | Staking Rewards Reserve | 15 % | 150 000 000 | Rate limit 1 %/jour, owner = `WINTGStaking` | `StakingRewardsReserve` |
| 9 | Trésorerie WINTG | 10 % | 100 000 000 | 10 % TGE + cliff 6 m + 48 m linéaire | `TreasuryVesting` |
| 10 | Partenaires institutionnels | 2 % | 20 000 000 | 0 % TGE + cliff 6 m + 24 m linéaire | `PartnersVesting` |
| **Total** | | **100 %** | **1 000 000 000** | | |

## Mécanique des frais (par transaction)

```
            100 % des fees collectés (gas × prix)
                          │
            ┌─────────────┼─────────────┬──────────────┐
           40 %          50 %          5 %            5 %
            │             │            │              │
            ▼             ▼            ▼              ▼
       WINTGTreasury  ValidatorPool  BurnContract  CommunityPool
       (multisig)     (pro-rata)     (→ 0x...dEaD) (campagnes,
                                                    airdrops)
```

Implémenté par `FeeDistributor.sol`. La répartition est **immutable** à la
construction (anti-rugpull économique). Seules les adresses destinataires
peuvent être tournées via la gouvernance — pratique quand un contrat aval
est mis à jour.

### Pourquoi ce ratio ?

- **40 % Treasury** : finance le développement, les grants, le marketing,
  l'opération courante.
- **50 % Validateurs** : récompense la production de blocs (revenus
  validateurs = fees uniquement, pas d'inflation pré-staking). C'est la
  part la plus importante : sans validateurs il n'y a pas de chaîne.
- **5 % Burn** : pression déflationniste pour aligner les intérêts
  long-terme des holders.
- **5 % Community Pool** : campagnes ponctuelles, airdrops, récompenses
  écosystème, sponsoring d'événements. Géré par la DAO.

## Schedule récapitulatif (TGE = T0)

```
WTG libérés au TGE :
  Public Sale      30 M (25 %)
  Private Sale      8 M (10 %)
  Liquidity        70 M (100 %)
  Ecosystem        10 M (5 %)
  Airdrop (potentiel) 24 M (30 % de 80M, claim individuel)
  Treasury         10 M (10 %)
  ─────────────────────────
  Total TGE max    ~152 M    (~15.2 % du supply)

Liquide à T+12 mois (calcul approximatif) :
  Public Sale      120 M (100 %)
  Private Sale     ~50 M  (10 % + 9 m sur 18 = 50 %)
  Ecosystem        ~60 M  (5 % + 25 % linéaire)
  Airdrop          ~80 M  (claim total)
  Treasury         ~30 M  (10 % + 25 % linéaire après cliff)
  Liquidity        70 M
  ─────────────────────────
  Total ~410 M     (~41 % du supply)

Liquide à T+48 mois :
  Toutes les tranches sauf Staking Reserve
  → ~850 M (85 %)

Staking Reserve : déblocage progressif phase 2 (rate limit 1 %/jour max
  = 1.5 M WTG/jour soit ~547.5 M/an de plafond, en pratique distribution
  beaucoup plus lente selon le contrat de staking de phase 2).
```

## Inflation post-TGE

- Genesis : `blockreward = 0x0` → **pas d'inflation** au niveau du protocole
- Inflation effective : déblocage progressif de la `StakingRewardsReserve`
  via le contrat `WINTGStaking`
- Plafond : **4 %/an du supply circulant**, soit max ~40 M WTG/an, imposé par
  - le rate-limit on-chain de `StakingRewardsReserve` (1 %/jour max)
  - le paramètre `rewardRate` de `WINTGStaking`, modifiable par DAO uniquement

## Burn cumulé prévu (mainnet T+5 ans)

Sur la base de 100 000 transactions/jour avec un fee moyen de 0.001 WTG :
- Fees journaliers : 100 WTG
- Burn quotidien (10 %) : 10 WTG
- Burn annuel : 3 650 WTG

> Pression déflationniste minimale en phase 1, montera mécaniquement avec
> l'adoption (paiements e-commerce, remittances).

## Implémentation on-chain

Tous les contrats sont déployés à des adresses **CREATE déterministes**
(deployer + nonce). Voir [`DEPLOYMENT.md`](./DEPLOYMENT.md) et
`contracts/scripts/generate-genesis.ts`.

| Nonce | Contrat | Allocation pré-genesis (WTG) |
|---:|---|---:|
| 0 | PublicSaleVesting | 120 000 000 |
| 1 | PrivateSaleVesting | 80 000 000 |
| 2 | TeamVesting | 150 000 000 |
| 3 | AdvisorsVesting | 30 000 000 |
| 4 | EcosystemVesting | 200 000 000 |
| 5 | AirdropVesting | 80 000 000 |
| 6 | StakingRewardsReserve | 150 000 000 |
| 7 | TreasuryVesting | 100 000 000 |
| 8 | PartnersVesting | 20 000 000 |
| 9 | WINTGTreasury (multisig) | 0 |
| 10 | BurnContract | 0 |
| 11 | FeeDistributor | 0 |
| 12 | WTGToken (WWTG wrapper) | 0 |
| _multisig_ | LiquidityMultisig (hors CREATE) | 70 000 000 |
| **Total** | | **1 000 000 000** |
