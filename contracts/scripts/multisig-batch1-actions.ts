/* eslint-disable no-console */
/**
 * multisig-batch1-actions.ts — exécute les actions multisig requises
 * juste après le déploiement du Batch 1.
 *
 * Actions :
 *   1. registry.setFactoryAuthorized(factory, true)
 *      → autorise la factory à marquer ses tokens en tier "FactoryCreated"
 *
 *   2. (optionnel — si --branding) chainMeta.setBranding(...)
 *      → pose les CIDs IPFS des logos officiels une fois fournis
 *
 * Usage :
 *   WALLETS_PASSPHRASE=xxx npx hardhat run scripts/multisig-batch1-actions.ts --network wintgTestnet
 *   WALLETS_PASSPHRASE=xxx npx hardhat run scripts/multisig-batch1-actions.ts --network wintgMainnet
 *
 *   # Pour aussi poser le branding (env vars optionnels)
 *   CHAIN_LOGO_URI="ipfs://Qm..." \
 *   NATIVE_LOGO_URI="ipfs://Qm..." \
 *   BANNER_URI="ipfs://Qm..." \
 *   CHAIN_DESCRIPTION="WINTG L1, sovereign African chain..." \
 *   PRIMARY_COLOR="#FF6A1A" \
 *   SECONDARY_COLOR="#0A0B12" \
 *   WEBSITE_URL="https://wintg.network" \
 *   EXPLORER_URL="https://scan.wintg.network" \
 *   WALLETS_PASSPHRASE=xxx \
 *   npx hardhat run scripts/multisig-batch1-actions.ts --network wintgMainnet -- --branding
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

const RUN_BRANDING = process.argv.includes("--branding");
const SKIP_AUTH = process.argv.includes("--skip-authorize");

async function main() {
  const networkKey = network.name;
  const manifestPath = resolve(__dirname, `../deployments/${networkKey}-batch1.json`);
  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest introuvable : ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Phase 1 manifest — for treasury address
  const phase1Path = resolve(__dirname, `../deployments/${networkKey}.json`);
  if (!existsSync(phase1Path)) {
    console.error(`❌ Manifest Phase 1 introuvable : ${phase1Path}`);
    process.exit(1);
  }
  const phase1 = JSON.parse(readFileSync(phase1Path, "utf-8"));
  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;

  console.log(`\n🌍 Réseau : ${networkKey} (chainId ${manifest.chainId})`);
  console.log(`🏦 Treasury (multisig) : ${treasuryAddr}`);

  const provider = ethers.provider;
  const signers = await loadTreasurySigners(provider);
  console.log(`🔓 ${signers.length} signers chargés.`);

  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  console.log(`🔐 Threshold : ${threshold}-of-${signers.length}`);

  const registry = await ethers.getContractAt("VerificationRegistry", manifest.contracts.VerificationRegistry.address);
  const factoryAddr: string = manifest.contracts.ERC20FactoryV2.address;
  const chainMeta = await ethers.getContractAt("WintgChainMetadata", manifest.contracts.WintgChainMetadata.address);

  // -----------------------------------------------------------------------
  // Action 1 — Authorize all known factories (ERC-20 + NFT 721 + NFT 1155)
  // -----------------------------------------------------------------------
  if (!SKIP_AUTH) {
    const allFactories: { name: string; address: string }[] = [
      { name: "ERC20FactoryV2", address: factoryAddr },
    ];

    // Also pick up Batch 2 factories if present.
    const batch2Path = resolve(__dirname, `../deployments/${networkKey}-batch2.json`);
    if (existsSync(batch2Path)) {
      const batch2 = JSON.parse(readFileSync(batch2Path, "utf-8"));
      if (batch2.contracts.NFTFactoryV2)   allFactories.push({ name: "NFTFactoryV2",   address: batch2.contracts.NFTFactoryV2.address });
      if (batch2.contracts.NFTFactory1155) allFactories.push({ name: "NFTFactory1155", address: batch2.contracts.NFTFactory1155.address });
    }

    for (const f of allFactories) {
      const already = await registry.isAuthorizedFactory(f.address);
      if (already) {
        console.log(`\n✅ ${f.name} (${f.address}) déjà autorisée — skip`);
        continue;
      }
      const data = registry.interface.encodeFunctionData("setFactoryAuthorized", [f.address, true]);
      await executeMultisigCall({
        treasury: treasury as any,
        to: await registry.getAddress(),
        value: 0n,
        data,
        threshold,
        signers,
        description: `setFactoryAuthorized(${f.name} = ${f.address}, true)`,
      });
      const after = await registry.isAuthorizedFactory(f.address);
      console.log(`   verif: ${f.name} authorized = ${after ? "✅" : "❌"}`);
    }
  }

  // -----------------------------------------------------------------------
  // Action 2 — Set chain branding (optional, requires env vars)
  // -----------------------------------------------------------------------
  if (RUN_BRANDING) {
    const chainLogo   = process.env.CHAIN_LOGO_URI    ?? "";
    const nativeLogo  = process.env.NATIVE_LOGO_URI   ?? "";
    const banner      = process.env.BANNER_URI        ?? "";
    const description = process.env.CHAIN_DESCRIPTION ?? "WINTG — Sovereign African Layer 1 chain";
    const primary     = process.env.PRIMARY_COLOR     ?? "#FF6A1A";
    const secondary   = process.env.SECONDARY_COLOR   ?? "#0A0B12";
    const website     = process.env.WEBSITE_URL       ?? "https://wintg.network";
    const explorer    = process.env.EXPLORER_URL      ?? "https://scan.wintg.network";

    console.log(`\n🎨 Branding payload :`);
    console.log(`   chainLogo  : ${chainLogo}`);
    console.log(`   nativeLogo : ${nativeLogo}`);
    console.log(`   banner     : ${banner}`);
    console.log(`   description: ${description}`);
    console.log(`   colors     : ${primary} / ${secondary}`);
    console.log(`   urls       : ${website} | ${explorer}`);

    const data = chainMeta.interface.encodeFunctionData("setBranding", [
      chainLogo, nativeLogo, banner, description, primary, secondary, website, explorer,
    ]);
    await executeMultisigCall({
      treasury: treasury as any,
      to: await chainMeta.getAddress(),
      value: 0n,
      data,
      threshold,
      signers,
      description: `chainMeta.setBranding(...)`,
    });
    const v = await chainMeta.version();
    console.log(`   verif: chainMeta.version() = ${v}`);
  } else {
    console.log(`\n💡 Pour aussi poser le branding, relancez avec --branding et les variables d'env :`);
    console.log(`     CHAIN_LOGO_URI, NATIVE_LOGO_URI, BANNER_URI, CHAIN_DESCRIPTION, PRIMARY_COLOR,`);
    console.log(`     SECONDARY_COLOR, WEBSITE_URL, EXPLORER_URL`);
  }

  console.log(`\n✅ Terminé.`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
