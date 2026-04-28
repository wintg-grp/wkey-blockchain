/* eslint-disable no-console */
/**
 * multisig-set-officials.ts — marque les 4 tokens officiels WINTG en
 * tier 3 (WintgOfficial / platine) via le VerificationRegistry.
 *
 * Tokens : WrappedWTG, WKEYToken, USDWToken, WCFAToken (Batch 3).
 *
 * Usage :
 *   WALLETS_PASSPHRASE=... npx hardhat run scripts/multisig-set-officials.ts --network wintgTestnet
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const networkKey = network.name;
  const batch1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch1.json`), "utf-8"));
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));

  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;
  const registryAddr: string = batch1.contracts.VerificationRegistry.address;

  const officialTokens = [
    batch3.contracts.WrappedWTG.address,
    batch3.contracts.WKEYToken.address,
    batch3.contracts.USDWToken.address,
    batch3.contracts.WCFAToken.address,
  ];

  console.log(`\n🌍 Réseau : ${networkKey}`);
  console.log(`📋 Registry: ${registryAddr}`);
  console.log(`🏆 Tokens à marquer en tier 3 (WintgOfficial / platine) :`);
  for (const t of officialTokens) console.log(`   ${t}`);

  const registry = await ethers.getContractAt("VerificationRegistry", registryAddr);
  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);

  console.log(`🔐 Threshold ${threshold}-of-${signers.length}`);

  // Check current tiers — skip if already set.
  let needsAction = false;
  for (const t of officialTokens) {
    const c = new ethers.Contract(t, ["function verificationTier() view returns (uint8)"], ethers.provider);
    const tier = Number(await c.verificationTier());
    console.log(`   ${t} current tier = ${tier}`);
    if (tier !== 3) needsAction = true;
  }

  if (!needsAction) {
    console.log(`\n✅ Tous déjà en tier 3 — rien à faire.`);
    return;
  }

  const data = registry.interface.encodeFunctionData("setOfficialBatch", [officialTokens]);
  await executeMultisigCall({
    treasury: treasury as any,
    to: registryAddr,
    value: 0n,
    data,
    threshold,
    signers,
    description: `setOfficialBatch(${officialTokens.length} tokens)`,
  });

  console.log(`\n🔍 Vérification post-execution :`);
  for (const t of officialTokens) {
    const c = new ethers.Contract(t, ["function verificationTier() view returns (uint8)"], ethers.provider);
    const tier = Number(await c.verificationTier());
    console.log(`   ${t} tier = ${tier} ${tier === 3 ? "✅" : "❌"}`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
