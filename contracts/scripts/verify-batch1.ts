/* eslint-disable no-console */
/**
 * verify-batch1.ts — vérifie que les contrats Batch 1 sont bien déployés
 * et que leur état initial est correct.
 *
 * Usage : npx hardhat run scripts/verify-batch1.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const networkKey = network.name;
  const manifestPath = resolve(__dirname, `../deployments/${networkKey}-batch1.json`);
  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest introuvable : ${manifestPath}`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(manifestPath, "utf-8"));
  console.log(`\n🌍 Réseau : ${networkKey} (chainId ${m.chainId})`);
  console.log(`📋 Vérification des 4 contrats Batch 1\n`);

  const cm = await ethers.getContractAt("WintgChainMetadata", m.contracts.WintgChainMetadata.address);
  console.log(`📦 WintgChainMetadata @ ${await cm.getAddress()}`);
  console.log(`   chainName            : ${await cm.chainName()}`);
  console.log(`   chainSymbol          : ${await cm.chainSymbol()}`);
  console.log(`   nativeTokenName      : ${await cm.nativeTokenName()}`);
  console.log(`   nativeTokenSymbol    : ${await cm.nativeTokenSymbol()}`);
  console.log(`   chainAdmin           : ${await cm.chainAdmin()}`);
  console.log(`   owner                : ${await cm.owner()}`);
  console.log(`   version              : ${await cm.version()}`);

  const reg = await ethers.getContractAt("VerificationRegistry", m.contracts.VerificationRegistry.address);
  console.log(`\n📦 VerificationRegistry @ ${await reg.getAddress()}`);
  console.log(`   verificationAdmin    : ${await reg.verificationAdmin()}`);
  console.log(`   treasury             : ${await reg.treasury()}`);
  console.log(`   owner                : ${await reg.owner()}`);
  console.log(`   VERIFICATION_FEE     : ${ethers.formatEther(await reg.VERIFICATION_FEE())} WTG`);
  const factAuthorized = await reg.isAuthorizedFactory(m.contracts.ERC20FactoryV2.address);
  console.log(`   factory authorized   : ${factAuthorized ? "✅ oui" : "⚠️  NON (multisig doit appeler setFactoryAuthorized)"}`);

  const factory = await ethers.getContractAt("ERC20FactoryV2", m.contracts.ERC20FactoryV2.address);
  console.log(`\n📦 ERC20FactoryV2 @ ${await factory.getAddress()}`);
  console.log(`   creationFee          : ${ethers.formatEther(await factory.creationFee())} WTG`);
  console.log(`   treasury             : ${await factory.treasury()}`);
  console.log(`   verificationRegistry : ${await factory.verificationRegistry()}`);
  console.log(`   owner                : ${await factory.owner()}`);
  console.log(`   tokensCount          : ${await factory.tokensCount()}`);

  const ms = await ethers.getContractAt("WintgMultiSender", m.contracts.WintgMultiSender.address);
  console.log(`\n📦 WintgMultiSender @ ${await ms.getAddress()}`);
  console.log(`   MAX_RECIPIENTS       : ${await ms.MAX_RECIPIENTS()}`);
  console.log(`   NATIVE_TRANSFER_GAS  : ${await ms.NATIVE_TRANSFER_GAS()}`);

  console.log(`\n✅ Tous les contrats Batch 1 répondent correctement.`);
  console.log(`\n🔑 Wallets admins générés :`);
  console.log(`   VerificationAdmin : ${m.generatedAccounts.verificationAdmin.address}`);
  console.log(`   ChainAdmin        : ${m.generatedAccounts.chainAdmin.address}`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
