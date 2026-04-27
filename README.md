# WINTG

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Besu](https://img.shields.io/badge/besu-26.4.0-orange)](https://besu.hyperledger.org)
[![Solidity](https://img.shields.io/badge/solidity-0.8.24-363636)](https://docs.soliditylang.org)
[![CI](https://github.com/wintg-grp/wkey-blockchain/actions/workflows/ci.yml/badge.svg)](https://github.com/wintg-grp/wkey-blockchain/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-≥95%25-brightgreen)](#tests--coverage)

Welcome to WINTG. We're building an EVM Layer 1 for Africa and the
broader UEMOA region — a chain that's fast enough for games, cheap
enough for everyday payments, and open enough that anyone can deploy
a contract or run a validator.

This repository contains everything we ship: the chain configuration,
the smart contracts, the SDK, the testnet faucet, and the operational
scripts behind our nodes.

## At a glance

- **Native token**: `WTG`. 1 000 000 000 fixed supply, deflationary fee
  burn, capped staking inflation.
- **Consensus**: Hyperledger Besu / IBFT 2.0 — instant finality, no
  orphan blocks.
- **Block time**: 1 second.
- **Block gas limit**: 100 000 000.
- **Minimum gas price**: 3 gwei.
- **Mainnet chain ID**: `2280` · **Testnet chain ID**: `22800`.
- **Open by default**: anyone deploys, anyone transacts, anyone applies
  to validate.

## Network endpoints

| | Mainnet | Testnet |
|---|---|---|
| RPC | `https://rpc.wintg.network` | `https://testnet-rpc.wintg.network` |
| WebSocket | `wss://ws.wintg.network` | `wss://testnet-ws.wintg.network` |
| Explorer | `https://scan.wintg.network` | `https://scan.wintg.network` |
| Faucet | n/a | `https://faucet.wintg.network` |
| Documentation | `https://doc.wintg.network` | — |

The explorer at `scan.wintg.network` displays both networks; switch
between them from the network selector inside the app.

To add WINTG to your wallet manually, use the values above with chain
ID `2280` (mainnet) or `22800` (testnet) and currency symbol `WTG`.
A one-click flow on the chain registries will follow shortly.

## Repository layout

```
.
├── besu/              Besu genesis + config (mainnet & testnet)
├── chainlist/         Chain registry submission package
├── contracts/         Solidity sources, Hardhat tests, deployment scripts
│   └── src/           Token, vesting, treasury, governance, factories,
│                      validators, NFT, DEX, lending, oracle, staking,
│                      bridge, stablecoin
├── docs/              Architecture, tokenomics, validator guide,
│                      gaming guide, deployment runbook
├── explorer/          Block explorer assembly
├── faucet/            Testnet faucet (Express + hCaptcha)
├── monitoring/        Prometheus + Grafana stack
├── scripts/           Server-side bootstrap (Ubuntu / AlmaLinux)
└── sdk/               TypeScript SDK for dApp developers
```

## Getting started

### Use WINTG as a developer

Install standard EVM tooling and point it at our RPC:

```ts
import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider("https://rpc.wintg.network");
const block = await provider.getBlockNumber();
console.log("WINTG block:", block);
```

For the testnet, switch to `https://testnet-rpc.wintg.network`, get
a few WTG from the faucet, and you're ready to deploy.

### Deploy a contract

```bash
cd contracts
npm install
npm run build
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:testnet
```

Verification on the explorer is wired through an Etherscan-compatible
endpoint already configured in `hardhat.config.ts`.

### Run a node

The bootstrap scripts for Ubuntu 22.04 LTS or AlmaLinux 9 live in
`scripts/`. The short version, on a fresh VPS:

```bash
git clone https://github.com/wintg-grp/wkey-blockchain.git
cd wkey-blockchain
sudo ./scripts/setup-validator.sh testnet
```

The script handles user creation, dependency installation, key
generation, the systemd unit, firewall rules, and brings the node
online. For AlmaLinux/RHEL hosts (notably with DirectAdmin) use
`scripts/install-besu-almalinux.sh`.

## Become a validator

WINTG is permissionless on the application layer: anyone deploys
contracts, anyone transacts. Validator membership uses an open
candidacy flow on top of IBFT 2.0:

1. Run a fully synced node and capture its enode + validator address.
2. Call `applyAsValidator(...)` on the `ValidatorRegistry` contract
   and post the bond. The bond is set in USD by governance — at
   launch, **10 USD** worth of WTG, computed live by an on-chain
   price feed. The DAO can change this amount at any time.
3. Existing validators review your candidacy. If approved, they vote
   you into the consensus set via `ibft_proposeValidatorVote`.
4. Your node starts producing blocks at the next epoch.

The bond stays locked in the contract while you operate. On a clean
exit it is refunded in full. In case of provable misbehavior, the
contract supports partial slashing — the slashed amount is sent to
the Treasury and the rest remains withdrawable on exit.

The full procedure (hardware, network, communication channels,
exit rules) is in [`docs/VALIDATOR_GUIDE.md`](docs/VALIDATOR_GUIDE.md).
We plan to expand the validator set as adoption grows.

## Tokenomics

WTG is the native gas and value asset of WINTG. Total supply is
fixed at one billion. Genesis allocations are pre-committed to vesting
contracts whose addresses are deterministic (CREATE-derived from the
deployer's nonce sequence) and verifiable directly from the genesis
file.

| Bucket | Share | Vesting |
|---|---:|---|
| Public sale | 12 % | Cliff + linear |
| Private sale | 8 % | Cliff + linear |
| Team & founders | 15 % | 1 y cliff, 4 y linear |
| Advisors | 3 % | 6 mo cliff, 2 y linear |
| Ecosystem fund | 20 % | 4 y linear |
| Liquidity | 7 % | TGE — multisig |
| Airdrop | 8 % | Phased unlocks |
| Staking rewards | 15 % | Programmatic emission |
| Treasury | 10 % | 4 y linear |
| Partners | 2 % | 1 y cliff, 2 y linear |

**Per-block fee distribution** — 40 % Treasury · 50 % validator pool ·
5 % burn · 5 % community pool (campaigns, airdrops, ecosystem rewards).

Numbers, contract addresses, and emission curves are in
[`docs/TOKENOMICS.md`](docs/TOKENOMICS.md).

## Build the chain locally

A single-validator dev chain comes up in under a minute:

```bash
docker compose -f docker-compose.local.yml up -d
cd contracts
npm install
npx hardhat run scripts/deploy-local.ts --network local
```

That spins up Besu, Blockscout, and Postgres locally; deploys the
full contract suite; and prints the addresses.

## Tests & coverage

```bash
cd contracts
npm test           # full Hardhat suite
npm run coverage   # solidity-coverage, ≥ 95 %
npm run lint       # solhint + eslint
```

CI runs all three on every push. The coverage gate is enforced.

## Security

We treat security as a hard requirement, not a feature. Every change
goes through:

- Solhint + Slither static analysis
- ≥ 95 % branch coverage
- Manual review before any change that touches token economics or
  consensus-adjacent code
- Encrypted multisig key custody (AES-256-GCM + scrypt)

Found a vulnerability? Please don't open a public issue. Email
**security@wintg.group** with the details — we acknowledge within 24
hours on weekdays. See [`SECURITY.md`](SECURITY.md) for the full
disclosure process.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture
- [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) — supply, allocations, vesting
- [`docs/VALIDATOR_GUIDE.md`](docs/VALIDATOR_GUIDE.md) — running a node
- [`docs/GAMING_GUIDE.md`](docs/GAMING_GUIDE.md) — building games on WINTG
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production runbook
- [`docs/FEES.md`](docs/FEES.md) — fee distribution and routing
- [`docs/API.md`](docs/API.md) — RPC + WS reference
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

## Contributing

We accept PRs. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
process — fork, branch, write tests, run lint and coverage, open the
PR. Conventional Commits, please. For larger changes, open an issue
first so we can discuss the design.

## License

WINTG is released under the [Apache License 2.0](LICENSE).
Contributions are accepted under the same license unless explicitly
noted otherwise.

## Contact

- **Email** — `contact@wintg.group` · `security@wintg.group`
- **Web** — `https://wintg.network`
- **Keybase** — `wintg`
- **Telegram / Discord** — channels are being set up; check the
  website for the current invites once they go live.

---

WINTG is an open-source project initiated by the WINTG Group, in West
Africa, for builders everywhere.
