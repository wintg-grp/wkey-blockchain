# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `applyAsValidator(...)` flow on `ValidatorRegistry` — public, bond-backed
  candidacy. Anyone can apply with a configurable WTG bond; existing
  validators approve via the IBFT JSON-RPC after the on-chain candidacy
  is accepted.
- `GAMING_GUIDE.md` — building games on WINTG, patterns, antipatterns.
- Apache 2.0 `LICENSE` and matching `NOTICE`.
- Contributor governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md` at repository root.

### Changed
- Block time reduced from 3 s to **1 s**. IBFT 2.0 with 1 validator handles
  this comfortably; multi-validator topology will be benchmarked before
  the validator set grows past 4.
- Per-block gas limit raised from 30M to **100M** for gaming/dApp throughput.
- Min gas price set to **3 gwei** to align with BNB Chain pricing.
- Network domains migrated from `*.wkey.app` to `*.wintg.network`. The
  WKEY brand is reserved for the consumer products built on top of WINTG
  (wallet, exchange, payments).
- License changed from MIT to **Apache 2.0** across all packages.
- Permissioning fully open: anyone can deploy contracts, anyone can peer.

### Deprecated
- The old `*.wkey.app` endpoints will continue to redirect for one minor
  release cycle and then be removed.
