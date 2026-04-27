#!/usr/bin/env bash
# =============================================================================
# generate-genesis-dual.sh — Generate both mainnet and testnet genesis files
# =============================================================================
# Wraps generate-genesis.ts to produce both files in one shot.
#
# Prerequisites: a .env file at the repository root with:
#   DEPLOYER_ADDRESS=0x...
#   VALIDATORS=0x...           (CSV for multi-validator setups)
#   LIQUIDITY_MULTISIG_ADDRESS=0x...
#
# Usage (from contracts/ directory):
#   ./scripts/generate-genesis-dual.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Generating mainnet genesis..."
npx ts-node scripts/generate-genesis.ts --network mainnet \
  --out ../besu/genesis.mainnet.json

echo
echo "→ Generating testnet genesis..."
npx ts-node scripts/generate-genesis.ts --network testnet \
  --out ../besu/genesis.testnet.json

echo
echo "✅ Both genesis files written:"
ls -la ../besu/genesis.mainnet.json ../besu/genesis.testnet.json
