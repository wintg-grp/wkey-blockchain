# Tester WINTG en local

Trois niveaux de test, du plus simple (30 sec) au plus complet (5 min) :

| Niveau | Outil | Stack | Quand l'utiliser |
|---|---|---|---|
| **A** | Hardhat tests | Mocha + chai | Itérer sur le code Solidity |
| **B** | Hardhat node | Hardhat éphémère | Tester dApps/SDK rapidement |
| **C** | Docker compose | **Besu réel** + Blockscout + Faucet | Validation end-to-end avant testnet/mainnet |

---

## Niveau A — Tests unitaires Hardhat (30 secondes)

Le plus rapide. Lance les **99 tests** de la suite Hardhat.

```bash
cd contracts
npm install            # première fois seulement (~3 min)
npm test               # → 99 passing
npm run coverage       # → rapport HTML dans coverage/
```

C'est ce que tu lances pour vérifier qu'aucune régression n'est introduite.

---

## Niveau B — Hardhat node + déploiement (1 minute)

Démarre un nœud EVM **éphémère** (chain ID 31337) avec 20 comptes pré-fundés à 10 000 ETH chacun, puis déploie les 18 contrats.

### Méthode automatique

```bash
chmod +x scripts/test-local-quick.sh
./scripts/test-local-quick.sh
```

Le script :
1. Compile les contrats
2. Lance `npx hardhat node` en arrière-plan
3. Déploie tous les contrats
4. Affiche les adresses + comment connecter MetaMask

### Méthode manuelle (2 terminaux)

**Terminal 1** :
```bash
cd contracts
npx hardhat node
```

**Terminal 2** :
```bash
cd contracts
npx hardhat run scripts/deploy-local.ts --network localhost
```

Adresses sauvegardées dans `contracts/deployments/localhost-local.json`.

### Connecter MetaMask

| Champ | Valeur |
|---|---|
| Network Name | WINTG Local Hardhat |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Symbol | WTG |

Importer le compte 0 dans MetaMask :
- Adresse : `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Clé privée : `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

> ⚠️ Cette clé est **publique** (utilisée par tous les devs Hardhat dans le monde). N'importer JAMAIS sur mainnet.

---

## Niveau C — Stack complète Besu Docker (5 minutes)

C'est le **test grandeur nature** : la même chaîne Besu IBFT 2.0 que la mainnet, avec block explorer Blockscout indexant en temps réel + faucet.

### Pré-requis

- Docker Desktop installé
- 8 GB de RAM dispo
- Ports 8545, 8546, 9545, 30303, 4000, 3030 libres

### Démarrage automatique

```bash
chmod +x scripts/test-local-besu.sh
./scripts/test-local-besu.sh
```

Le script :
1. Démarre Besu IBFT 2.0 (chainId **22800**, block time 3 s)
2. Démarre Blockscout (indexation, ~60 s pour être prêt)
3. Démarre le faucet (port 3030)
4. Déploie les 18 contrats

### Démarrage manuel

```bash
docker compose -f docker-compose.local.yml up -d

# Attendre 30s, puis déployer
cd contracts
npx hardhat run scripts/deploy-local.ts --network local
```

### Endpoints locaux

| Service | URL |
|---|---|
| RPC HTTP | `http://localhost:8545` |
| RPC WebSocket | `ws://localhost:8546` |
| Métriques Prometheus | `http://localhost:9545/metrics` |
| **Block Explorer** | `http://localhost:4000` |
| Faucet | `http://localhost:3030/api/health` |

### Connecter MetaMask au Besu local

| Champ | Valeur |
|---|---|
| Network Name | WINTG Local Besu |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `22800` |
| Symbol | WTG |
| Block Explorer | `http://localhost:4000` |

### Cleanup

```bash
docker compose -f docker-compose.local.yml down       # garde les données
docker compose -f docker-compose.local.yml down -v    # cleanup total (volumes inclus)
```

---

## Tester chaque feature

Une fois la stack lancée, voici comment tester chaque morceau :

### 1. Transferts WTG natifs

```bash
cd contracts
npx hardhat console --network local
```
```js
const [me] = await ethers.getSigners();
await me.sendTransaction({ to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: ethers.parseEther("1") });
console.log(await ethers.provider.getBalance("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));
```

### 2. WWTG wrapper (wrap/unwrap)

```js
const { contracts } = require("./deployments/local-local.json");
const wtg = await ethers.getContractAt("WTGToken", contracts.WTGToken);
await wtg.deposit({ value: ethers.parseEther("10") });
console.log("Mon balance WWTG :", ethers.formatEther(await wtg.balanceOf(me.address)));
```

### 3. DEX — créer une pair et swap

```js
const factory = await ethers.getContractAt("WINTGFactory", contracts.WINTGFactory);
const router = await ethers.getContractAt("WINTGRouter", contracts.WINTGRouter);
const wtg = await ethers.getContractAt("WTGToken", contracts.WTGToken);

// Wrap 100 WTG
await wtg.deposit({ value: ethers.parseEther("100") });
await wtg.approve(contracts.WINTGRouter, ethers.MaxUint256);

// Pour tester un swap il faut deux tokens — déployer un mock ERC20
const Mock = await ethers.getContractFactory("WTGToken");  // réutilise WWTG
const tokenB = await Mock.deploy();
await tokenB.deposit({ value: ethers.parseEther("100") });
await tokenB.approve(contracts.WINTGRouter, ethers.MaxUint256);

const deadline = Math.floor(Date.now() / 1000) + 3600;
await router.addLiquidity(
  contracts.WTGToken, await tokenB.getAddress(),
  ethers.parseEther("50"), ethers.parseEther("50"),
  0, 0, me.address, deadline,
);
console.log("✓ Liquidity added");

// Swap 1 WWTG → tokenB
const path = [contracts.WTGToken, await tokenB.getAddress()];
const out = await router.getAmountsOut(ethers.parseEther("1"), path);
console.log("Expected out :", ethers.formatEther(out[1]));
await router.swapExactTokensForTokens(ethers.parseEther("1"), 0, path, me.address, deadline);
console.log("✓ Swap done");
```

### 4. Staking — stake / earn / claim

```js
const staking = await ethers.getContractAt("WINTGStaking", contracts.WINTGStaking);

await staking.stake({ value: ethers.parseEther("10") });
console.log("Total staked :", ethers.formatEther(await staking.totalStaked()));

// Avancer le temps de 1h (Besu : juste attendre 1h ; Hardhat : evm_increaseTime)
await ethers.provider.send("evm_increaseTime", [3600]);
await ethers.provider.send("evm_mine");

const earned = await staking.earned(me.address);
console.log("Earned :", ethers.formatEther(earned), "WTG");

await staking.claimRewards();
console.log("✓ Rewards claimed");
```

### 5. Governance — propose / vote / execute

```js
const wtg = await ethers.getContractAt("WTGToken", contracts.WTGToken);
const gov = await ethers.getContractAt("WINTGGovernor", contracts.WINTGGovernor);

// Wrap + delegate (sinon pas de droit de vote)
await wtg.deposit({ value: ethers.parseEther("100") });
await wtg.delegate(me.address);

// Avancer 1 bloc pour activer le pouvoir de vote
await ethers.provider.send("evm_mine");

const targets = [contracts.WINTGTreasury];
const values = [0];
const calldatas = ["0x"];
const desc = "Test proposal";

const tx = await gov.propose(targets, values, calldatas, desc);
const r = await tx.wait();
console.log("Proposal ID dans logs :", r.logs);
```

### 6. Bridge — lock vers BSC simulé

```js
const bridge = await ethers.getContractAt("WINTGBridge", contracts.WINTGBridge);
await bridge.lock(56, me.address, { value: ethers.parseEther("5") });
console.log("Total locked :", ethers.formatEther(await bridge.totalLocked()));
```

### 7. NFT — mint un ERC-721

```js
const nft = await ethers.getContractAt("WINTGNFT", contracts.WINTGNFT);
await nft.mint(me.address, "ipfs://QmTestMetadata");
console.log("Mon NFT #1 :", await nft.ownerOf(1));
console.log("URI       :", await nft.tokenURI(1));

// Voir sur Blockscout : http://localhost:4000/token/<contracts.WINTGNFT>
```

### 8. Faucet (Niveau C uniquement)

```bash
# Health check
curl http://localhost:3030/api/health | jq

# Demander 100 WTG sur testnet local (sans hCaptcha en local)
curl -X POST http://localhost:3030/api/drip \
  -H "Content-Type: application/json" \
  -d '{"address":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","captcha":"any"}'
```

---

## Déployer ton propre smart contract

WINTG est **100 % EVM-compatible**. Tu peux déployer n'importe quel contrat Solidity :

```bash
cd contracts
mkdir -p src/custom
cat > src/custom/MyToken.sol <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor() ERC20("MyToken", "MTK") {
        _mint(msg.sender, 1_000_000 * 1e18);
    }
}
EOF

npx hardhat compile

# Déployer
npx hardhat run --network local <<'EOF'
const MyToken = await ethers.getContractFactory("MyToken");
const t = await MyToken.deploy();
await t.waitForDeployment();
console.log("Deployed at:", await t.getAddress());
EOF
```

Le contrat apparaît immédiatement dans Blockscout (`http://localhost:4000`) avec son code source vérifiable.

---

## Troubleshooting

| Problème | Solution |
|---|---|
| Port 8545 déjà occupé | `lsof -i :8545` puis kill, ou changer port dans docker-compose.local.yml |
| Besu OOM (Out Of Memory) | Augmenter `BESU_OPTS=-Xmx8g` dans docker-compose.local.yml |
| Blockscout reste sur "loading..." | Attendre 60-120s pour la première indexation. `docker compose logs blockscout` |
| MetaMask "Internal JSON-RPC error" | Reset le compte (Settings > Advanced > Clear activity tab data) |
| `nonce too low` lors du déploiement | Reset le compte MetaMask (changement de chainId) |
| Faucet "Faucet drained" | Le faucet local a peu de WTG. Re-fund manuellement ou redémarrer la stack avec `down -v` |

## Commandes utiles

```bash
# Stats de la chaîne
curl -X POST http://localhost:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Validateurs IBFT
curl -X POST http://localhost:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"ibft_getValidatorsByBlockNumber","params":["latest"],"id":1}'

# Solde d'un compte
curl -X POST http://localhost:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","latest"],"id":1}'

# Logs Besu en temps réel
docker compose -f docker-compose.local.yml logs -f besu

# Inspecter un contrat déployé
cd contracts
npx hardhat console --network local
> const c = await ethers.getContractAt("WINTGStaking", "0x...");
> await c.totalStaked();
```
