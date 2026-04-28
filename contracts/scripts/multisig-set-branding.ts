/* eslint-disable no-console */
/**
 * multisig-set-branding.ts — appelle chainMeta.setBranding(...) via le
 * multisig pour poser les logos officiels de la chaîne et du WTG natif.
 *
 * Usage :
 *   WALLETS_PASSPHRASE=... \
 *   CHAIN_LOGO_URI="ipfs://Qm.../wintg-chain.png" \
 *   NATIVE_LOGO_URI="ipfs://Qm.../wtg.png" \
 *   BANNER_URI="ipfs://Qm.../banner.png" \
 *   CHAIN_DESCRIPTION="WINTG — première blockchain souveraine d'Afrique de l'Ouest" \
 *   PRIMARY_COLOR="#FF6A1A" \
 *   SECONDARY_COLOR="#0A0B12" \
 *   WEBSITE_URL="https://wintg.network" \
 *   EXPLORER_URL="https://scan.wintg.network" \
 *   npx hardhat run scripts/multisig-set-branding.ts --network wintgMainnet
 *
 * Tous les champs sont optionnels (chaîne vide = ne pas renseigner).
 */

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const networkKey = network.name;
  const batch1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch1.json`), "utf-8"));
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));

  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;
  const chainMetaAddr: string = batch1.contracts.WintgChainMetadata.address;

  const chainLogo   = process.env.CHAIN_LOGO_URI    ?? "";
  const nativeLogo  = process.env.NATIVE_LOGO_URI   ?? "";
  const banner      = process.env.BANNER_URI        ?? "";
  const description = process.env.CHAIN_DESCRIPTION ?? "WINTG — première blockchain souveraine d'Afrique de l'Ouest";
  const primary     = process.env.PRIMARY_COLOR     ?? "#FF6A1A";
  const secondary   = process.env.SECONDARY_COLOR   ?? "#0A0B12";
  const website     = process.env.WEBSITE_URL       ?? "https://wintg.network";
  const explorer    = process.env.EXPLORER_URL      ?? "https://scan.wintg.network";

  console.log(`\n🌍 Réseau : ${networkKey}`);
  console.log(`📦 ChainMeta : ${chainMetaAddr}`);
  console.log(`🎨 Branding payload :`);
  console.log(`   chainLogo  : ${chainLogo || "(vide)"}`);
  console.log(`   nativeLogo : ${nativeLogo || "(vide)"}`);
  console.log(`   banner     : ${banner || "(vide)"}`);
  console.log(`   description: ${description}`);
  console.log(`   primary    : ${primary}`);
  console.log(`   secondary  : ${secondary}`);
  console.log(`   website    : ${website}`);
  console.log(`   explorer   : ${explorer}`);

  const chainMeta = await ethers.getContractAt("WintgChainMetadata", chainMetaAddr);
  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);

  const data = chainMeta.interface.encodeFunctionData("setBranding", [
    chainLogo, nativeLogo, banner, description, primary, secondary, website, explorer,
  ]);

  await executeMultisigCall({
    treasury: treasury as any,
    to: chainMetaAddr,
    value: 0n,
    data,
    threshold,
    signers,
    description: `chainMeta.setBranding(...)`,
  });

  const v = await chainMeta.version();
  console.log(`\n✅ chainMeta.version() = ${v}`);
  console.log(`   chainLogoURI       = ${await chainMeta.chainLogoURI()}`);
  console.log(`   nativeTokenLogoURI = ${await chainMeta.nativeTokenLogoURI()}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
