# WINTG

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Besu](https://img.shields.io/badge/besu-26.4.0-orange)](https://besu.hyperledger.org)
[![Solidity](https://img.shields.io/badge/solidity-0.8.24-363636)](https://docs.soliditylang.org)
[![CI](https://github.com/wintg-grp/wkey-blockchain/actions/workflows/ci.yml/badge.svg)](https://github.com/wintg-grp/wkey-blockchain/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-≥95%25-brightgreen)](#tests--coverage)

WINTG is an EVM-compatible Layer 1 designed for builders in Africa and the
broader UEMOA region — fast, cheap, with a permissionless smart contract
surface and a focus on dApps, gaming, and consumer payments.

- **Native token**: `WTG` — fixed 1 000 000 000 supply, deflationary fee burn, capped staking inflation
- **Consensus**: Hyperledger Besu / IBFT 2.0 — instant finality, no orphan blocks
- **Block time**: 1 second
- **Gas limit**: 100 000 000 per block
- **Min gas price**: 3 gwei (aligned with BNB Chain)
- **Mainnet chain ID**: `2280` · **Testnet chain ID**: `22800`
- **Permissionless**: anyone can deploy a contract, anyone can apply to run a validator

## Network endpoints

| | Mainnet | Testnet |
|---|---|---|
| RPC | `https://rpc.wintg.network` | `https://testnet-rpc.wintg.network` |
| WebSocket | `wss://ws.wintg.network` | `wss://testnet-ws.wintg.network` |
| Explorer | `https://scan.wintg.network` | `https://testnet-scan.wintg.network` |
| Faucet | n/a | `https://faucet.wintg.network` |
| Documentation | `https://doc.wintg.network` | — |

To add WINTG to MetaMask manually, use the values above with chain ID
`2280` (mainnet) or `22800` (testnet) and currency symbol `WTG`. Or use
the one-click flow on Chainlist once we land there.

## What's in this repository

```
.
├── besu/              Besu genesis + config files (mainnet & testnet)
├── chainlist/         Chain registry submission package (logos, JSON)
├── contracts/         Solidity sources, Hardhat tests, deployment scripts
│   └── src/           Token, vesting, treasury, governance, factories,
│                      validators, NFT, DEX, lending, oracle, staking,
│                      bridge, stablecoin
├── docs/              Tokenomics, validator guide, architecture,
│                      deployment runbook, gaming guide
├── explorer/          Block explorer assembly (Blockscout-based + custom UI)
├── faucet/            Testnet faucet (Express + hCaptcha)
├── monitoring/        Prometheus + Grafana stack
├── scripts/           Server-side bootstrap (Ubuntu / AlmaLinux)
└── sdk/               TypeScript SDK for dApp developers
```

## Getting started

### Use WINTG as a developer

Install any standard EVM tooling and point it at the RPC:

```bash
npm install ethers
```

```ts
import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider("https://rpc.wintg.network");
const block = await provider.getBlockNumber();
console.log("WINTG mainnet block:", block);
```

For the testnet, switch the URL to `https://testnet-rpc.wintg.network`,
get a few WTG from the faucet, and you're ready to deploy.

### Deploy a contract

Deployments work like on any EVM network. With Hardhat:

```bash
cd contracts
npm install
npm run build
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:testnet
```

Verify the contract on the explorer through the Etherscan-compatible
endpoint already wired into `hardhat.config.ts`.

### Run a node

The full bootstrap script for Ubuntu 22.04 LTS or AlmaLinux 9 lives in
`scripts/`. The short version, on a fresh Ubuntu VPS:

```bash
git clone https://github.com/wintg-grp/wkey-blockchain.git
cd wkey-blockchain
sudo ./scripts/setup-validator.sh testnet
```

The script handles user creation, dependency installation, key
generation, systemd unit, firewall rules, and brings the node online.
For AlmaLinux/RHEL hosts (notably with DirectAdmin) use
`scripts/install-besu-almalinux.sh`.

## Become a validator

WINTG is permissionless on the application layer: anyone can deploy
contracts and submit transactions. Validator membership uses an open
candidacy model on top of IBFT 2.0:

1. Run a syncing node and capture its enode + validator address
2. Call `applyAsValidator(...)` on the `ValidatorRegistry` contract
   with the required bond (currently 100 WTG)
3. Existing validators review the candidacy and, if approved, vote the
   new node in via `ibft_proposeValidatorVote`
4. The new node starts producing blocks at the next epoch

The full procedure, hardware requirements, and exit rules live in
[`docs/VALIDATOR_GUIDE.md`](docs/VALIDATOR_GUIDE.md).

We expect the validator set to grow to 6 nodes within the first 6
months and to 24 nodes within 24 months. The roadmap and acceptance
criteria are public.

## Tokenomics

WTG is the native gas and value asset of WINTG. Total supply is fixed
at one billion. Genesis allocations are pre-committed to vesting
contracts whose addresses are deterministic (CREATE-derived from the
deployer's nonce sequence) and verifiable from the genesis file.

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

Fee distribution per block: **70 % Treasury / 20 % validator pool / 10 % burn.**
Full numbers, contract addresses, and emission curves in
[`docs/TOKENOMICS.md`](docs/TOKENOMICS.md).

## Build the chain locally

You can spin up a single-validator dev chain in under a minute:

```bash
docker compose -f docker-compose.local.yml up -d
cd contracts
npm install
npx hardhat run scripts/deploy-local.ts --network local
```

This spins up Besu, Blockscout, and Postgres locally; deploys the full
contract suite and prints the addresses.

## Tests & coverage

```bash
cd contracts
npm test           # full Hardhat suite
npm run coverage   # solidity-coverage, target ≥ 95 %
npm run lint       # solhint + eslint
```

CI runs all three on every push. Coverage gate is enforced.

## Security

WINTG is built with security as a non-negotiable. Every change goes
through:

- Solhint + Slither static analysis
- ≥ 95 % branch coverage
- Manual audit before mainnet token deploys
- Encrypted multisig key custody (AES-256-GCM + scrypt)

Found a vulnerability? Don't open a public issue — email
**security@wintg.group** with the details. We respond within 24 hours
on weekdays. See [`SECURITY.md`](SECURITY.md) for the full disclosure
process and reward range.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full system architecture
- [`docs/TOKENOMICS.md`](docs/TOKENOMICS.md) — supply, allocations, vesting math
- [`docs/VALIDATOR_GUIDE.md`](docs/VALIDATOR_GUIDE.md) — running a node
- [`docs/GAMING_GUIDE.md`](docs/GAMING_GUIDE.md) — building games on WINTG
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment runbook
- [`docs/FEES.md`](docs/FEES.md) — fee distribution and routing
- [`docs/API.md`](docs/API.md) — RPC + WS reference
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

## Contributing

We accept PRs. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
process — short version: fork, branch, write tests, run lint+coverage,
open the PR. Conventional Commits, please.

For larger changes, open an issue first to discuss the design. We're
happy to mentor first-time contributors on smaller items tagged
`good-first-issue`.

## License

WINTG is released under the [Apache License 2.0](LICENSE). Contributions
are licensed under the same terms unless explicitly noted.

## Contact

- Email: contact@wintg.group · security@wintg.group
- Web: https://wintg.network
- GitHub: https://github.com/wintg-grp/wkey-blockchain

---

WINTG is an open-source project initiated by the WINTG Group. Built in
West Africa, for builders everywhere.
