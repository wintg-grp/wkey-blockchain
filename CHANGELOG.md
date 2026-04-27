# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `applyAsValidator(...)` flow on `ValidatorRegistry` — public,
  bond-backed candidacy. The bond is denominated in USD and converted
  to WTG live via an on-chain price feed. Existing validators approve
  via the IBFT JSON-RPC after the on-chain candidacy is accepted.
- `slash(address, percentBps)` on `ValidatorRegistry` for partial
  slashing; refunded bond on clean exit (`remove()`).
- `MockPriceFeed.sol` test helper.
- 5 % `communityPool` bucket on `FeeDistributor` — campaigns, airdrops,
  ecosystem rewards. New 4-arg constructor.
- `GAMING_GUIDE.md` — building games on WINTG, patterns and
  antipatterns.
- Apache 2.0 `LICENSE` and matching `NOTICE`.
- Contributor governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md` at repository root.

### Changed
- Block time reduced from 3 s to **1 s**. IBFT 2.0 with one validator
  handles this comfortably; multi-validator topology will be
  benchmarked before the validator set grows past four.
- Per-block gas limit raised from 30M to **100M**.
- Minimum gas price set to **3 gwei**.
- **Fee split** moved from `70 / 20 / 10` (Treasury / Validators / Burn)
  to **`40 / 50 / 5 / 5`** (Treasury / Validators / Burn / Community).
  The validator share is now the largest because validators carry the
  operational load.
- Network domains migrated from `*.wkey.app` to `*.wintg.network`.
  The WKEY brand is reserved for consumer products built on top of
  WINTG (wallet, exchange, payments).
- Single explorer at `scan.wintg.network` for both mainnet and testnet
  (network selector inside the app), replacing the separate
  `testnet-scan.wintg.network`.
- Validator bond moved from a static WTG amount to a USD-denominated
  amount converted live via the price feed. Default at launch:
  10 USD equivalent.
- License changed from MIT to **Apache 2.0** across all packages.
- Permissioning fully open: anyone can deploy contracts, anyone can
  peer.

### Deprecated
- The old `*.wkey.app` endpoints will redirect for one minor release
  cycle and then be removed.
- The old `testnet-scan.wintg.network` subdomain is no longer used —
  use `scan.wintg.network` with the network switcher.
