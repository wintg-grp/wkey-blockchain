# Fees

This page documents how fees work on WINTG: what users pay to send a
transaction, how those fees are distributed, and what extra fees apply
to specific factory operations.

## 1. Transaction fees (gas)

Every operation on WINTG consumes gas. The cost of a transaction is:

```
   cost = gas used  ×  gas price
```

WINTG parameters:

| Parameter | Value |
|---|---|
| `min-gas-price` | 3 gwei (= 0.000000003 WTG per gas unit) |
| Block time | 1 second |
| Block gas limit | 100 000 000 |

### Typical operation costs

| Operation | Gas | Cost in WTG |
|---|---:|---:|
| Native WTG transfer | 21 000 | 0.000063 |
| ERC-20 transfer (e.g. USDW) | ~50 000 | 0.00015 |
| ERC-20 approve | ~46 000 | 0.000138 |
| DEX swap | ~150 000 | 0.00045 |
| Add liquidity | ~200 000 | 0.0006 |
| Mint a single NFT | ~120 000 | 0.00036 |
| Stake | ~80 000 | 0.00024 |
| DAO vote | ~100 000 | 0.0003 |
| Deploy a small contract | ~500 000 | 0.0015 |
| Create a token via factory | ~1 200 000 + 100 WTG fee | 0.0036 + 100 fee |

### How fees are distributed

Block fees go to the validator that produced the block (Besu's
default coinbase model). A keeper periodically sweeps that balance
into the `FeeDistributor` contract and calls `distribute()`. The
contract then splits the funds with a fixed, immutable basis-point
schedule:

```
   100 % of collected fees
              │
              ▼  swept into the contract by a keeper
        FeeDistributor
              │
   ┌──────────┼──────────┬───────────┐
   │          │          │           │
  40 %      50 %        5 %         5 %
   │          │          │           │
   ▼          ▼          ▼           ▼
Treasury  Validator   Burn       Community
WINTG      pool       contract     pool
          (pro-rata   → 0x...dEaD  (campaigns,
          per block)  (deflation)   airdrops,
                                    rewards)
```

The 40 / 50 / 5 / 5 split is **immutable** in the contract. Only the
recipient addresses can be rotated by governance — useful when a
downstream contract is upgraded. See
[`FeeDistributor.sol`](../contracts/src/fees/FeeDistributor.sol).

## 2. Token creation fees

Beyond gas, **creating a new token** through one of our factories
costs a fixed fee in WTG that goes to the Treasury. This is a
deliberate anti-spam mechanism — without it, anyone can deploy
millions of throwaway tokens and clutter the chain.

### Launch prices

| Action | Fee | + Gas | Notes |
|---|---:|---:|---|
| Create an ERC-20 (`ERC20Factory.createERC20`) | 100 WTG | ~0.0036 WTG | Mintable / burnable / EIP-2612 permit |
| Create an ERC-721 (`NFTFactory.createERC721`) | 50 WTG | ~0.0045 WTG | EIP-2981 royalties baked in |
| Create an ERC-1155 (`NFTFactory.createERC1155`) | 50 WTG | ~0.0045 WTG | EIP-2981 royalties baked in |

These fees are **adjustable by governance** through the
`WINTGGovernor` + `WINTGTimelock` pipeline. The contracts cap them
at 10 000 WTG to prevent any single party from making token creation
prohibitively expensive.

### Example: create an ERC-20 in one transaction

```ts
const factory = new ethers.Contract(
  ERC20_FACTORY_ADDR,
  ["function createERC20(string,string,uint8,uint256,bool) payable returns (address)"],
  signer,
);

const tx = await factory.createERC20(
  "MyToken",
  "MTK",
  18,
  ethers.parseEther("1000000"),
  true,
  { value: ethers.parseEther("100") }    // 100 WTG factory fee
);
const receipt = await tx.wait();
console.log("Token deployed at:", receipt.logs[0].args.token);
```

## 3. Other on-chain operations

| Operation | Cost |
|---|---|
| Stake WTG | Gas only |
| Unstake (1 h cooldown) | Gas only |
| Claim staking rewards | Gas only (rewards come from `StakingRewardsReserve`) |
| Mint USDW (stablecoin) | Gas + 2 %/year stability fee on the open debt |
| USDW liquidation | Gas (liquidator earns a 5 % bonus in collateral) |
| Supply / borrow on `LendingPool` | Gas + variable interest rate based on utilisation |
| Lock to bridge | Gas only |

## 4. Validator economics

Validators receive **50 % of every block's fees** through the
`FeeDistributor`. The keeper sweeps the validator coinbase balance
into the distributor at a regular cadence; you can also sweep your
own coinbase manually if you operate a node.

Token-creation fees do **not** flow to validators — they go to the
Treasury, which funds operations and grants. This separation keeps
validator incentives focused on producing blocks, not on policing
token creation.

## 5. Inflation

There is no protocol-level inflation: `blockreward = 0x0` in the
genesis. Staking rewards are paid from a pre-funded reserve
(`StakingRewardsReserve`, 150 M WTG) at a rate capped at 4 %/year
of the total supply. When the reserve runs dry, staking rewards stop
unless governance refills it.

## 6. Governance over fee parameters

Adjustable by DAO vote (`WINTGGovernor` → `WINTGTimelock`):

- `min-gas-price` — applied per validator on the Besu side
- `erc20Fee`, `erc721Fee`, `erc1155Fee` in the factories
- `stabilityFeeBps` in `USDW` (capped at 10 %/year)
- Recipient addresses on the `FeeDistributor`

Hard-coded and immutable (anti-rugpull):

- The 40 / 50 / 5 / 5 distribution split
- `MAX_FEE` ceilings on factories (10 000 WTG each)
- `LIQUIDATION_BONUS_BPS` on the lending pool

## References

- [`besu/genesis.json`](../besu/genesis.json) — chain parameters
- [`contracts/src/fees/FeeDistributor.sol`](../contracts/src/fees/FeeDistributor.sol)
- [`contracts/src/token/ERC20Factory.sol`](../contracts/src/token/ERC20Factory.sol)
- [`contracts/src/nft/NFTFactory.sol`](../contracts/src/nft/NFTFactory.sol)
- [`contracts/src/staking/WINTGStaking.sol`](../contracts/src/staking/WINTGStaking.sol)
