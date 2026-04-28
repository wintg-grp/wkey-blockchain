/* eslint-disable no-console */
/**
 * deploy-batch2.ts — Déploiement Phase 1.6 (Batch 2 NFT).
 *
 * Contrats déployés (3) :
 *   1. NFTFactoryV2     — factory ERC-721 (50 WTG)
 *   2. NFTFactory1155   — factory ERC-1155 (50 WTG)
 *   3. WINTGMarketplace — marketplace (2 % fee)
 *
 * Réutilise la VerificationRegistry du Batch 1.
 *
 * Usage :
 *   npx hardhat run scripts/deploy-batch2.ts --network wintgTestnet
 *   npx hardhat run scripts/deploy-batch2.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Batch1Record {
  contracts: Record<string, { address: string }>;
}

interface Batch2Record {
  network: string;
  chainId: string;
  deployer: string;
  timestamp: string;
  contracts: Record<string, { address: string; constructorArgs: unknown[] }>;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;
  const balance = await provider.getBalance(deployer.address);

  console.log(`\n🌍 Réseau : ${network.name} (chainId ${chainId})`);
  console.log(`👤 Deployer : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(balance)} WTG\n`);

  // -----------------------------------------------------------------------
  // Lecture Batch 1 + Phase 1
  // -----------------------------------------------------------------------
  const networkKey = network.name;
  const batch1Path = resolve(__dirname, `../deployments/${networkKey}-batch1.json`);
  if (!existsSync(batch1Path)) {
    console.error(`❌ Batch 1 introuvable : ${batch1Path}`);
    process.exit(1);
  }
  const batch1 = JSON.parse(readFileSync(batch1Path, "utf-8")) as Batch1Record;
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));

  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;
  const registryAddr: string = batch1.contracts.VerificationRegistry.address;

  console.log(`🏦 Treasury (multisig) : ${treasuryAddr}`);
  console.log(`📋 VerificationRegistry: ${registryAddr}\n`);

  // -----------------------------------------------------------------------
  // 1) NFTFactoryV2
  // -----------------------------------------------------------------------
  console.log(`📦 1/3 — Déploiement NFTFactoryV2 (ERC-721)…`);
  const F721 = await ethers.getContractFactory("NFTFactoryV2");
  const f721Args = [treasuryAddr, treasuryAddr, registryAddr] as const;
  const f721 = await F721.deploy(...f721Args);
  await f721.waitForDeployment();
  const f721Addr = await f721.getAddress();
  console.log(`   ✅ ${f721Addr}`);

  // -----------------------------------------------------------------------
  // 2) NFTFactory1155
  // -----------------------------------------------------------------------
  console.log(`\n📦 2/3 — Déploiement NFTFactory1155 (ERC-1155)…`);
  const F1155 = await ethers.getContractFactory("NFTFactory1155");
  const f1155Args = [treasuryAddr, treasuryAddr, registryAddr] as const;
  const f1155 = await F1155.deploy(...f1155Args);
  await f1155.waitForDeployment();
  const f1155Addr = await f1155.getAddress();
  console.log(`   ✅ ${f1155Addr}`);

  // -----------------------------------------------------------------------
  // 3) WINTGMarketplace
  // -----------------------------------------------------------------------
  console.log(`\n📦 3/3 — Déploiement WINTGMarketplace…`);
  const MP = await ethers.getContractFactory("WINTGMarketplace");
  const mpArgs = [treasuryAddr, treasuryAddr] as const;
  const mp = await MP.deploy(...mpArgs);
  await mp.waitForDeployment();
  const mpAddr = await mp.getAddress();
  console.log(`   ✅ ${mpAddr}`);

  // -----------------------------------------------------------------------
  // Save manifest
  // -----------------------------------------------------------------------
  const record: Batch2Record = {
    network: networkKey,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      NFTFactoryV2:     { address: f721Addr,  constructorArgs: [...f721Args]  },
      NFTFactory1155:   { address: f1155Addr, constructorArgs: [...f1155Args] },
      WINTGMarketplace: { address: mpAddr,    constructorArgs: [...mpArgs]    },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch2.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");
  console.log(`\n📝 Manifest sauvegardé : ${outPath}`);

  console.log(`\n🎯 Récap :`);
  for (const [name, c] of Object.entries(record.contracts)) {
    console.log(`   ${name.padEnd(18)} ${c.address}`);
  }

  console.log(`\n⚙️  Actions multisig requises ensuite :`);
  console.log(`   registry.setFactoryAuthorized(${f721Addr}, true)`);
  console.log(`   registry.setFactoryAuthorized(${f1155Addr}, true)`);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
