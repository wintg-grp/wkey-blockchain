# Building games on WINTG

WINTG is built to be a friendly home for game studios. This guide walks
through what we ship out of the box, how to think about on-chain
economies for games, and what a typical integration looks like.

If you're shipping a Web3 game and the existing chains are either too
expensive (Ethereum L1), too slow (most BFT networks at high load), or
too restrictive on contract size and gas, WINTG is worth a serious look.

## What WINTG gives you for free

| Capability | Where it lives | What you do with it |
|---|---|---|
| Native token (`WTG`) | Genesis | Gas, in-game currency, payouts |
| Wrapped WTG (`WWTG`) | `contracts/src/token/WTGToken.sol` | DeFi-grade ERC-20 wrapper for marketplaces / DEX |
| ERC-20 factory | `contracts/src/token/ERC20Factory.sol` | Spin up a soft currency or premium token in one tx |
| ERC-721 + ERC-1155 factory | `contracts/src/nft/NFTFactory.sol` | Cosmetics, items, characters, deeds |
| WINTGNFT (ERC-721) | `contracts/src/nft/WINTGNFT.sol` | Royalty-aware NFT collection template |
| WINTGCollection (ERC-1155) | `contracts/src/nft/WINTGCollection.sol` | Stackable items / consumables |
| Native DEX | `contracts/src/dex/*` | Liquidity pools (Uniswap V2 fork) for token swaps |
| Oracle aggregator | `contracts/src/oracle/OracleAggregator.sol` | Fair-price feeds for in-game economies |
| Multicall3 | `contracts/src/utils/Multicall3.sol` | Bulk reads from clients without RPC fan-out |

100M gas per block + 1 s block time means a game can comfortably push
batched updates (state syncs, daily quests, rewards) every second
without queueing.

## Picking the right token type

Most games we've seen end up needing **two or three** distinct asset
types:

- **Soft currency** — earned in-game, infinite supply, no real-world
  value implied. Spin up a fresh ERC-20 via the factory, set yourself
  as minter, mint as players earn. No vesting, no caps.

- **Premium currency** — bought with WTG (or pegged stablecoin via the
  bridge), usually with a buy-back-and-burn loop tied to game spend.
  Use the same factory; cap the mintable supply.

- **Cosmetics & items** — ERC-1155 is almost always the right fit for
  fungible items (potions, ammo, materials). ERC-721 for unique items
  (characters, weapons, lands).

You don't need to deploy your own factory. The shared `NFTFactory`
already handles ERC-721 with EIP-2981 royalties and ERC-1155 with
royalties + token URIs. You pay a one-time fee in WTG to spawn a
collection, then you own it outright (you're the contract owner — we
have no special powers).

## Pattern: a game economy in 30 minutes

Here's a fully working example that mints a soft currency, drops a
cosmetic, and lets the player burn the cosmetic to earn currency.
Real games are bigger but the shape is the same.

```ts
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://rpc.wintg.network");
const studio = new ethers.Wallet(STUDIO_KEY, provider);

// 1. Spin up your soft currency. The factory contract address is
//    published in the deployment manifest after mainnet launch.
const factory = new ethers.Contract(ERC20_FACTORY, factoryAbi, studio);
const tx = await factory.createERC20(
  "Crystal Dust",       // name
  "CDUST",              // symbol
  18,                   // decimals
  0n,                   // initialSupply (we'll mint as players earn)
  true,                 // mintable
  { value: ethers.parseEther("100") }, // factory fee
);
const receipt = await tx.wait();
const tokenAddr = parseTokenCreatedEvent(receipt);

// 2. Spin up a cosmetic collection (ERC-1155).
const nftFactory = new ethers.Contract(NFT_FACTORY, nftAbi, studio);
const tx2 = await nftFactory.createERC1155(
  "Crystal Skins", "CSKN", "ipfs://your-cid/{id}.json",
  studio.address,    // royaltyReceiver
  500,               // 5 % royalties
  { value: ethers.parseEther("50") },
);
// ...

// 3. Server-side: mint currency to a player when they complete a quest.
const cdust = new ethers.Contract(tokenAddr, erc20Abi, studio);
await cdust.mint(playerAddress, ethers.parseEther("250"));

// 4. Player can spend it: from their wallet, call burn() or transfer.
//    No further server intervention needed — the chain is the source of truth.
```

## Pattern: signed mint vouchers

A common gotcha for game devs new to Web3: you don't want every
single player action to cost gas to your studio account. Use signed
vouchers — your server signs `(player, item, amount, nonce, expiry)`
off-chain, the player pays the gas to redeem.

```solidity
// In your custom item contract:
function redeem(
    address player,
    uint256 itemId,
    uint256 amount,
    uint256 nonce,
    uint256 expiry,
    bytes calldata signature
) external {
    require(block.timestamp <= expiry, "expired");
    require(!used[nonce], "replay");
    bytes32 digest = keccak256(abi.encode(player, itemId, amount, nonce, expiry));
    require(_recover(digest, signature) == studioSigner, "bad sig");
    used[nonce] = true;
    _mint(player, itemId, amount, "");
}
```

This pattern is well-established (OpenSea, Immutable, Skybound all use
variations). Your server stays cheap; players pay micro-fees in WTG.

## Best practices we keep seeing

- **Don't mint everything at game start.** Mint as players earn. Caps
  the supply visibly to the supply curve of actual gameplay, which is
  what speculators care about.

- **Watch your event indexing budget.** Blockscout indexes the chain
  fine, but if your client subscribes via WebSocket to every transfer
  on a popular collection you'll burn frontend memory. Use `eth_getLogs`
  with bounded ranges, not unbounded subscriptions, for backfill.

- **Use ERC-1155 for fungible items.** ERC-721 for stackables forces
  you to reinvent batching and explodes your gas bills. The 1155
  approval model is designed for marketplaces.

- **Keep server keys hot, treasury keys cold.** Use a mintable token
  with a "minter" role granted to a hot key. Move the *owner* role to
  a multisig (or to your `WINTGTreasury` instance) so nobody can
  exfiltrate the contract if the hot key leaks.

- **Test on testnet first, with real player traffic patterns.** Deploy
  to `testnet-rpc.wintg.network`, run a beta with friends, watch for
  reverts. The faucet at `faucet.wintg.network` will keep you topped up.

## Audit and review before launch

We strongly recommend a third-party audit before you go live with any
contract that holds real player money. WINTG's contracts pass through
solhint, slither, and ≥ 95 % branch coverage; yours should too. We
maintain a list of auditor contacts at `docs/AUDITORS.md` (coming).

If you're unsure about a contract pattern or want a second pair of
eyes, open a discussion in the GitHub repo or email
`contact@wintg.group`. We don't audit for free, but we'll happily
point you at the right resources.

## What's coming

- **Game Identity Standard** — a lightweight spec for cross-game player
  identity / inventory portability. RFC in progress.
- **Random number coordinator** — verifiable on-chain RNG for loot
  drops. Targeted for Q2.
- **Marketplace contract template** — generic fixed-price + auction
  marketplace, plug-and-play for games. Targeted for Q2.

Watch the GitHub repo for `gaming-` tagged issues and PRs.

---

Questions, edge cases, want to be featured on the WINTG showcase?
Email `contact@wintg.group` with a link to your project.
