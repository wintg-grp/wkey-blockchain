# API publique — WINTG

## Endpoints

### Mainnet (Chain ID `2280`)

| Service | Endpoint |
|---|---|
| RPC HTTPS | `https://rpc.wintg.network` |
| WebSocket | `wss://ws.wintg.network` |
| Block Explorer | `https://scan.wintg.network` |
| API Blockscout | `https://scan.wintg.network/api` |

### Testnet (Chain ID `22800`)

| Service | Endpoint |
|---|---|
| RPC HTTPS | `https://testnet-rpc.wintg.network` |
| WebSocket | `wss://testnet-ws.wintg.network` |
| Block Explorer | `https://scan.wintg.network` |
| Faucet | `https://faucet.wintg.network` |

## Configuration MetaMask

```
Network Name : WINTG Mainnet
RPC URL      : https://rpc.wintg.network
Chain ID     : 2280
Symbol       : WTG
Block Explorer: https://scan.wintg.network
```

Ajout en 1 clic : **Coming soon** sur [chainlist.org](https://chainlist.org).

## RPC JSON-RPC

WINTG expose les namespaces standards :

| Namespace | Méthodes courantes |
|---|---|
| `eth` | `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_sendRawTransaction`, `eth_getLogs`, `eth_getTransactionReceipt`, `eth_chainId`, `eth_gasPrice`, `eth_estimateGas`, ... |
| `net` | `net_version`, `net_peerCount` |
| `web3` | `web3_clientVersion` |
| `txpool` | `txpool_status`, `txpool_content` |

> Les namespaces `IBFT`, `ADMIN`, `DEBUG` ne sont **pas** exposés publiquement (validateur uniquement, loopback).

### Exemples curl

```bash
# Hauteur de chaîne
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://rpc.wintg.network

# Solde d'un wallet
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xVotreAdresse","latest"],"id":1}' \
  https://rpc.wintg.network

# Chain ID
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  https://rpc.wintg.network
```

### WebSocket

```javascript
import { ethers } from "ethers";
const ws = new ethers.WebSocketProvider("wss://ws.wintg.network");
ws.on("block", (n) => console.log("Nouveau bloc :", n));
```

## Limites & rate limit

| Type | Limite | Action si dépassé |
|---|---|---|
| HTTPS RPC par IP | 30 req/s (burst 60) | HTTP 429 |
| Batch RPC max size | 50 méthodes | erreur RPC |
| `eth_getLogs` range | 5 000 blocs max | erreur RPC |
| `trace_filter` range | 1 000 blocs max | erreur RPC |
| WebSocket connections | 500 simultanées | TCP reset |

Pour des limites supérieures (entreprise) : `partners@wintg.group`.

## API Blockscout

Compatible Etherscan API. Documentation complète : [`/api-docs`](https://scan.wintg.network/api-docs).

### Exemples

```bash
# Liste des transactions d'une adresse
curl "https://scan.wintg.network/api?module=account&action=txlist&address=0x..."

# Solde token (ERC-20)
curl "https://scan.wintg.network/api?module=account&action=tokenbalance&contractaddress=0xWWTG&address=0x..."

# Vérification de contrat
curl -X POST -F "addressHash=0x..." -F "name=MyContract" -F "compilerVersion=0.8.24" -F "sourceCode=..." \
  "https://scan.wintg.network/api?module=contract&action=verify"
```

## Smart contracts canoniques

Adresses (mainnet — placeholders à remplir post-deploy) :

| Contrat | Adresse |
|---|---|
| `WTGToken` (WWTG) | `0x...` |
| `WINTGTreasury` | `0x...` |
| `FeeDistributor` | `0x...` |
| `BurnContract` | `0x...` |
| `PublicSaleVesting` | `0x...` |
| `PrivateSaleVesting` | `0x...` |
| `TeamVesting` | `0x...` |
| `EcosystemVesting` | `0x...` |
| `AirdropVesting` | `0x...` |
| `StakingRewardsReserve` | `0x...` |
| `TreasuryVesting` | `0x...` |
| `PartnersVesting` | `0x...` |
| `AdvisorsVesting` | `0x...` |

Voir `contracts/deployments/wintgMainnet.json` pour la liste à jour.

## Faucet (testnet uniquement)

```bash
curl -X POST https://faucet.wintg.network/api/drip \
  -H "Content-Type: application/json" \
  -d '{"address": "0xVotreAdresse", "captcha": "<hcaptcha-token>"}'
```

- 100 WTG par adresse / par 24 h
- Anti-sybil : hCaptcha + IP rate limit
- Source : multisig faucet pré-financé par Ecosystem

## Statut & monitoring public

📊 [`https://status.wintg.network`](https://status.wintg.network) (à produire)

- Uptime mainnet/testnet
- Block time courant
- Liste des validateurs actifs
- Hauteur de chaîne en temps réel
