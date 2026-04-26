# `@wintg/sdk` — TypeScript SDK officiel pour la blockchain WINTG

```bash
npm install @wintg/sdk ethers
```

## Quick start

```ts
import { WintgClient, parseWtg } from "@wintg/sdk";
import { Wallet } from "ethers";

const client = WintgClient.mainnet();        // ou .testnet()
const wallet = new Wallet(process.env.PRIVATE_KEY!, client.provider);

// Solde natif
const bal = await client.getBalance(wallet.address);
console.log(bal.formatted, bal.symbol);

// Stake 100 WTG
await client.staking.stake(wallet, parseWtg("100"));

// Swap 1 WTG → TokenB via DEX
await client.dex.swapExactWTGForTokens({
  value: parseWtg("1"),
  minOut: 0n,
  path: [client.network.contracts.WTGToken, "0xTOKEN_B"],
  to: wallet.address,
  wallet,
});

// Lock 50 WTG vers BSC (chainId 56)
await client.bridge.lock(wallet, 56, wallet.address, parseWtg("50"));

// Lire le prix WTG/USD via l'oracle
const round = await client.oracle.latestRoundData();
const decimals = await client.oracle.decimals();
console.log("WTG/USD =", Number(round.answer) / 10 ** decimals);
```

## Modules

| Adapter | Rôle |
|---|---|
| `client.dex` | Swaps + add/remove liquidity (Uniswap V2-compatible) |
| `client.staking` | Stake / unstake / réclamer rewards |
| `client.governance` | Propose / vote / execute (DAO) |
| `client.bridge` | Lock/unlock cross-chain |
| `client.oracle` | Lire les prix on-chain (Chainlink-compatible) |

## Réseaux

- **Mainnet** (chainId 2280) : `WintgClient.mainnet()`
- **Testnet** (chainId 22800) : `WintgClient.testnet()`
- Custom : `new WintgClient(myNetworkObject)`

## Helpers

```ts
import { parseWtg, formatWtg, isWintgAddress, toChecksumAddress } from "@wintg/sdk";

parseWtg("12.5")                  // 12500000000000000000n (wei)
formatWtg(12500000000000000000n)  // "12.5"
isWintgAddress("0xabc...")        // boolean
toChecksumAddress("0xabc...")     // EIP-55 checksum
```

## Licence

MIT — copier, forker, redistribuer librement.
