/* eslint-disable no-console */
/**
 * WINTG WTG/CFA Oracle Pusher
 * ----------------------------
 * Push le prix WTG/CFA toutes les 15 minutes sur le `WtgCfaPriceOracle`
 * de la chaîne mainnet (et testnet).
 *
 * En phase 1 (Pre-DEX), le prix est administré : 50 CFA × 10^8 (8 décimales
 * comme Chainlink).
 *
 * Phase 2 : on agrégera plusieurs sources (DEX TWAP + Chainlink XOF/USD).
 *
 * Configuration via .env :
 *   ORACLE_PRIVATE_KEY      hex 64 chars (l'opérateur autorisé du contrat)
 *   ORACLE_RPC_MAINNET      https://rpc.wintg.network
 *   ORACLE_RPC_TESTNET      https://testnet-rpc.wintg.network
 *   ORACLE_ADDRESS_MAINNET  0xBF9611B2671FB566865eBF928bd89d40b64C7A08
 *   ORACLE_ADDRESS_TESTNET  0xBF9611B2671FB566865eBF928bd89d40b64C7A08
 *   ORACLE_HEARTBEAT_MS     900000 (15 min) — défaut
 *   ORACLE_PRICE_CFA        50 — défaut prix admin Pre-DEX
 */

import { JsonRpcProvider, Wallet, Contract } from "ethers";

const HEARTBEAT_MS = parseInt(process.env.ORACLE_HEARTBEAT_MS || "900000", 10);
const DEFAULT_PRICE_CFA = parseInt(process.env.ORACLE_PRICE_CFA || "50", 10);
const PRICE_DECIMALS = 8;
const SCALE = 10n ** BigInt(PRICE_DECIMALS);

const ABI = [
  "function pushPrice(int256 newPrice) external",
  "function latestPrice() view returns (int256)",
  "function latestUpdate() view returns (uint64)",
  "function isStale() view returns (bool)",
  "function isOperator(address) view returns (bool)"
];

async function pushOnce(label, rpc, oracleAddr, key, priceCfa) {
  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(key, provider);
  const oracle = new Contract(oracleAddr, ABI, wallet);

  const isOp = await oracle.isOperator(wallet.address);
  if (!isOp) {
    console.warn(`[${label}] ⚠️  ${wallet.address} n'est pas operator du WtgCfaPriceOracle. Skip.`);
    return;
  }

  const newPrice = BigInt(priceCfa) * SCALE;
  const current = await oracle.latestPrice();

  // Skip si pas de différence (économise du gas)
  if (current === newPrice) {
    console.log(`[${label}] ✓ price unchanged (${priceCfa} CFA), heartbeat refresh`);
    // On push quand même pour rafraîchir le heartbeat (anti-stale)
  }

  try {
    const tx = await oracle.pushPrice(newPrice);
    const receipt = await tx.wait();
    console.log(`[${label}] ✓ pushPrice(${priceCfa} CFA × 1e8) tx=${tx.hash} block=${receipt.blockNumber}`);
  } catch (e) {
    console.error(`[${label}] ❌ pushPrice failed:`, e.message ?? e);
  }
}

async function tick() {
  const ts = new Date().toISOString();
  console.log(`\n--- ${ts} ---`);
  const tasks = [];
  if (process.env.ORACLE_RPC_MAINNET && process.env.ORACLE_ADDRESS_MAINNET) {
    tasks.push(pushOnce(
      "MAINNET",
      process.env.ORACLE_RPC_MAINNET,
      process.env.ORACLE_ADDRESS_MAINNET,
      process.env.ORACLE_PRIVATE_KEY,
      DEFAULT_PRICE_CFA
    ));
  }
  if (process.env.ORACLE_RPC_TESTNET && process.env.ORACLE_ADDRESS_TESTNET) {
    tasks.push(pushOnce(
      "TESTNET",
      process.env.ORACLE_RPC_TESTNET,
      process.env.ORACLE_ADDRESS_TESTNET,
      process.env.ORACLE_PRIVATE_KEY,
      DEFAULT_PRICE_CFA
    ));
  }
  await Promise.all(tasks);
}

async function main() {
  if (!process.env.ORACLE_PRIVATE_KEY) {
    console.error("ORACLE_PRIVATE_KEY env var manquant");
    process.exit(1);
  }
  console.log(`WINTG Oracle Pusher started — heartbeat=${HEARTBEAT_MS}ms, price=${DEFAULT_PRICE_CFA} CFA`);
  await tick();
  setInterval(tick, HEARTBEAT_MS);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
