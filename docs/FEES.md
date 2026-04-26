# Frais sur la blockchain WINTG

> **TL;DR** : WINTG copie le modèle BNB Chain mais avec un gas price plus bas
> (1 gwei au lieu de 3-5 gwei sur BNB), donc les transactions sont **2-5×
> moins chères** qu'avec BNB. En plus, **créer un token (ERC-20, NFT, etc.)
> coûte un frais fixe en WTG** versé à la Trésorerie WINTG.

---

## 1. Frais de transaction (gas)

### Comment ça marche (comme sur Ethereum / BNB)

Chaque action sur la blockchain consomme du **gas** (= unité de calcul). Tu paies :

```
   Coût de la transaction = gas utilisé × gas price
```

Sur WINTG :

| Paramètre | Valeur |
|---|---|
| `min-gas-price` | **1 gwei** (= 0.000000001 WTG par unité de gas) |
| Block time | 3 secondes |
| Block gas limit | 30 000 000 |
| Comparaison BNB Chain | 3-5 gwei (donc WINTG est 3-5× moins cher) |

### Coûts concrets en WTG

| Action | Gas requis | Coût en WTG |
|---|---:|---:|
| Transfert WTG natif (entre 2 personnes) | 21 000 | **0.000021 WTG** |
| Transfert ERC-20 (USDW, USDT…) | ~50 000 | 0.00005 WTG |
| Approve ERC-20 | ~46 000 | 0.000046 WTG |
| Swap sur le DEX (WTG → USDW) | ~150 000 | 0.00015 WTG |
| Add liquidité DEX | ~200 000 | 0.0002 WTG |
| Mint un NFT (1 unité) | ~120 000 | 0.00012 WTG |
| Stake | ~80 000 | 0.00008 WTG |
| Vote DAO (governance) | ~100 000 | 0.0001 WTG |
| **Déployer un contrat simple** | ~500 000 | 0.0005 WTG |
| **Créer un token via TokenFactory** | ~1 200 000 + 100 WTG | ~0.0012 WTG + **100 WTG fee** |

### Coûts en USD (selon le prix du WTG)

| Action | WTG @ $0.01 | WTG @ $0.10 | WTG @ $1 | WTG @ $10 |
|---|---:|---:|---:|---:|
| Transfert simple | $0.00000021 | $0.0000021 | $0.000021 | $0.00021 |
| Swap DEX | $0.0000015 | $0.000015 | $0.00015 | $0.0015 |
| Mint NFT | $0.0000012 | $0.000012 | $0.00012 | $0.0012 |
| Déploiement contrat | $0.000005 | $0.00005 | $0.0005 | $0.005 |

### Comparaison avec d'autres blockchains

| Action | WINTG (WTG @ $0.10) | BNB Chain | Polygon | Ethereum |
|---|---:|---:|---:|---:|
| Transfert simple | **$0.0000021** | $0.05–0.10 | $0.001 | $1–10 |
| Swap DEX | **$0.000015** | $0.20–1 | $0.005 | $5–50 |
| Mint NFT | **$0.000012** | $0.30–0.50 | $0.01 | $10–100 |
| Déploiement contrat | **$0.00005** | $1–3 | $0.10 | $50–200 |

**Verdict** : WINTG est **10 000 à 1 000 000× moins cher** qu'Ethereum, et **5 000 à 10 000× moins cher** que BNB. C'est ce qui rend possible les **micro-paiements** (achat de crédit téléphone, courses, etc.) que les autres chaînes ne peuvent pas servir.

### Où vont les frais ?

```
   100 % des frais collectés
            │
            ▼  (envoi auto par le validateur via keeper)
       FeeDistributor
            │
   ┌────────┼────────┐
   │        │        │
  70 %    20 %     10 %
   │        │        │
   ▼        ▼        ▼
Treasury  Validateurs  BurnContract
WINTG     (pro-rata    → 0x...dEaD
          blocs validés)  (déflation)
```

Implémenté dans [`FeeDistributor.sol`](../contracts/src/fees/FeeDistributor.sol).

---

## 2. Frais de création de tokens

Au-delà du gas, **créer un nouveau token** sur WINTG passe par le contrat
[`TokenFactory`](../contracts/src/token/TokenFactory.sol). Tu paies un **frais fixe en WTG** qui va à la Trésorerie WINTG.

### Pourquoi ?

- 🛡️ **Anti-spam** : décourage les milliers de tokens scam déployés gratuitement
- 💰 **Revenu stable pour le projet** : finance le développement et le marketing
- 🎨 **Templates prêts à l'emploi** : tu n'as PAS besoin d'écrire de code Solidity, juste de remplir les paramètres

### Tarifs au lancement

| Action | Frais en WTG | + Gas tx | Total approximatif |
|---|---:|---:|---:|
| **Créer un ERC-20** (token fongible) | **100 WTG** | ~0.0012 WTG | 100 WTG |
| **Créer un NFT ERC-721** (collection) | **50 WTG** | ~0.0015 WTG | 50 WTG |
| **Créer un ERC-1155** (multi-token) | **50 WTG** | ~0.0015 WTG | 50 WTG |

> 💡 Les frais sont **modifiables par la DAO** (`WINTGGovernor` + `WINTGTimelock`) et plafonnés à **10 000 WTG** par le smart contract (anti-rugpull).

### Comment créer un token (exemple)

```javascript
// Avec ethers.js
const factory = new ethers.Contract(
  "0xTOKENFACTORY_ADDRESS",
  ["function createERC20(string,string,uint8,uint256,bool) payable returns (address)"],
  signer,
);

// Créer "MyToken" avec symbole "MTK", 18 décimales, 1 000 000 supply, mintable
const tx = await factory.createERC20(
  "MyToken",
  "MTK",
  18,
  ethers.parseEther("1000000"),
  true,
  { value: ethers.parseEther("100") }   // 100 WTG de fee
);
const receipt = await tx.wait();
console.log("Token déployé à:", receipt.logs[0].args.token);
```

### Templates inclus

#### `SimpleERC20`
- ERC-20 standard (transfer, approve, allowance)
- EIP-2612 Permit (signatures gasless)
- Burnable (burn, burnFrom)
- Mintable (optionnel — `mintable=true` à la création)
- Décimales configurables (0-18)

#### `WINTGNFT` (ERC-721)
- Enumerable (lister tous les NFT d'une adresse)
- URI Storage (metadata IPFS par token)
- Pausable (urgence)
- **Royalties EIP-2981** (compatible OpenSea, marketplaces)
- AccessControl multi-rôle (MINTER_ROLE, PAUSER_ROLE)

#### `WINTGCollection` (ERC-1155)
- Multi-token (items de jeu, billets d'événements)
- Supply tracking par ID
- Pausable
- Royalties EIP-2981
- Mint single + batch

### Pourquoi c'est mieux qu'écrire son propre contrat ?

| Aspect | Écrire son propre contrat | Via `TokenFactory` |
|---|---|---|
| Compétences requises | Solidity, sécurité smart contract | Aucune (juste appeler une fonction) |
| Risque de bug | Élevé (overflows, reentrancy…) | Zéro (templates audités) |
| Coût | Gas de déploiement (~$0.0005) + temps dev | 100 WTG + gas (~$10 si WTG=$0.10) |
| Compatibilité OpenSea, DEX | À tester | Garantie (templates standards) |
| Royalties EIP-2981 | À implémenter | Inclus |
| Pause d'urgence | À implémenter | Inclus |

---

## 3. Frais des autres opérations on-chain

| Opération | Coût |
|---|---|
| Stake WTG | Gas seulement (~0.00008 WTG) |
| Unstake (cooldown 1h) | Gas seulement |
| Claim rewards staking | Gas seulement (les rewards viennent du `StakingRewardsReserve`) |
| Mint USDW (stablecoin) | Gas + 2 %/an stability fee sur la dette |
| Liquidation USDW | Gas (le liquidateur reçoit 5 % bonus en collatéral) |
| Supply/Borrow LendingPool | Gas + intérêts variables (selon utilisation du pool) |
| Lock vers Bridge cross-chain | Gas seulement |

---

## 4. Comparaison économique avec d'autres chaînes

### Ethereum (référence haut de gamme)
- Gas price : 10-100 gwei (variable)
- 1 transfert = $1-20
- Mint NFT = $10-100
- Deploy contract = $50-500
- **Avantage** : sécurité maximale, écosystème énorme
- **Inconvénient** : impossible pour micro-paiements

### BNB Chain (notre référence prix)
- Gas price : 3-5 gwei
- 1 transfert = $0.05-0.10
- Mint NFT = $0.30-0.50
- Deploy contract = $1-3
- **Avantage** : bon écosystème DeFi, prix raisonnables
- **Inconvénient** : encore trop cher pour mobile money quotidien

### Polygon
- Gas price : 30-100 gwei (mais MATIC moins cher)
- 1 transfert = $0.001-0.01
- **Avantage** : compatible Ethereum, prix bas
- **Inconvénient** : sécurité dépendante d'Ethereum (PoS limité)

### **WINTG (notre cible : marché UEMOA)**
- Gas price : 1 gwei
- 1 transfert = **<$0.001 quel que soit le prix du WTG**
- Mint NFT = **<$0.01**
- Deploy contract = **<$0.05**
- **Avantage** : prix imbattables, contrôle souverain (validateurs UEMOA)
- **Avantage** : block time 3s = UX comme BNB
- **Inconvénient** : écosystème à construire, audit nécessaire avant mainnet

---

## 5. Évolution future des frais

Les paramètres sont **modifiables par la DAO** (vote `WINTGGovernor` → exécution `WINTGTimelock`) :

- `min-gas-price` (côté Besu, modifiable par les validateurs eux-mêmes)
- `erc20Fee`, `erc721Fee`, `erc1155Fee` dans `TokenFactory.setFees()`
- `stabilityFeeBps` dans `USDW.setStabilityFee()` (capé à 10 %/an)
- `LIQUIDATION_BONUS_BPS` (constante immuable côté lending)
- Ratio 70/20/10 dans `FeeDistributor` (constante immuable, anti-rugpull)

---

## 6. Récap pour les développeurs dApp

```
🟢 Bon marché et automatique :
   - Tous les calls / transferts on-chain
   - Stake, swap, lend, vote DAO

🟡 Bon marché mais frais one-shot :
   - Déployer ton propre contrat custom = ~0.0005 WTG (juste le gas)

🔴 Frais fixes en WTG (anti-spam, vont au Treasury) :
   - Créer un token via TokenFactory : 50-100 WTG
```

---

## 7. Pour la blockchain elle-même (validateurs)

Les **validateurs** (toi pour l'instant) reçoivent :
- 20 % des frais de transactions (via `FeeDistributor`)
- Les frais de creation de tokens vont à 100 % au Treasury (pas aux validateurs)

Inflation prévue :
- 0 % au protocole (`blockreward = 0x0` dans le genesis)
- ≤ 4 %/an via `WINTGStaking` qui distribue les rewards depuis `StakingRewardsReserve` (150 M WTG bloqués)

---

> Toutes ces valeurs sont définies dans :
> - [`besu/genesis.json`](../besu/genesis.json) — gas price minimal, block time, supply
> - [`contracts/src/fees/FeeDistributor.sol`](../contracts/src/fees/FeeDistributor.sol) — répartition 70/20/10
> - [`contracts/src/token/TokenFactory.sol`](../contracts/src/token/TokenFactory.sol) — frais création tokens
> - [`contracts/src/staking/WINTGStaking.sol`](../contracts/src/staking/WINTGStaking.sol) — taux de staking
