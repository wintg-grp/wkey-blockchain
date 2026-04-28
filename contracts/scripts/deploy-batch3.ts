/* eslint-disable no-console */
/**
 * deploy-batch3.ts — Déploiement Phase 1.7 (Batch 3 — Tokens officiels).
 *
 * Contrats :
 *   1. WrappedWTG  (WWTG)   — wrapper 1:1 du WTG natif
 *   2. WKEYToken   (WKEY)   — utility wallet, cap 100M, votes activés
 *   3. USDWToken   (USDW)   — stablecoin USD (mintable par MINTER_ROLE)
 *   4. WCFAToken   (WCFA)   — stablecoin franc CFA (mintable par MINTER_ROLE)
 *
 * Usage :
 *   npx hardhat run scripts/deploy-batch3.ts --network wintgTestnet
 *   npx hardhat run scripts/deploy-batch3.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Batch1Record { contracts: Record<string, { address: string }> }
interface Batch3Record {
  network: string; chainId: string; deployer: string; timestamp: string;
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

  console.log(`🏦 Treasury    : ${treasuryAddr}`);
  console.log(`📋 Registry    : ${registryAddr}\n`);

  // -----------------------------------------------------------------------
  // 1) WrappedWTG
  // -----------------------------------------------------------------------
  console.log(`📦 1/4 — Déploiement WrappedWTG (WWTG)…`);
  const WWTG = await ethers.getContractFactory("WrappedWTG");
  const wwtgArgs = [treasuryAddr, registryAddr, ""] as const;
  const wwtg = await WWTG.deploy(...wwtgArgs);
  await wwtg.waitForDeployment();
  const wwtgAddr = await wwtg.getAddress();
  console.log(`   ✅ ${wwtgAddr}`);

  // -----------------------------------------------------------------------
  // 2) WKEYToken
  // -----------------------------------------------------------------------
  console.log(`\n📦 2/4 — Déploiement WKEYToken (WKEY)…`);
  const WKEY = await ethers.getContractFactory("WKEYToken");
  const wkeyArgs = [treasuryAddr, registryAddr, ""] as const;
  const wkey = await WKEY.deploy(...wkeyArgs);
  await wkey.waitForDeployment();
  const wkeyAddr = await wkey.getAddress();
  console.log(`   ✅ ${wkeyAddr}`);
  console.log(`      cap        : 100M WKEY`);
  console.log(`      initial    : 30M WKEY → ${treasuryAddr}`);

  // -----------------------------------------------------------------------
  // 3) USDWToken
  // -----------------------------------------------------------------------
  console.log(`\n📦 3/4 — Déploiement USDWToken (USDW)…`);
  const USDW = await ethers.getContractFactory("USDWToken");
  const usdwArgs = [treasuryAddr, registryAddr, ""] as const;
  const usdw = await USDW.deploy(...usdwArgs);
  await usdw.waitForDeployment();
  const usdwAddr = await usdw.getAddress();
  console.log(`   ✅ ${usdwAddr}`);

  // -----------------------------------------------------------------------
  // 4) WCFAToken
  // -----------------------------------------------------------------------
  console.log(`\n📦 4/4 — Déploiement WCFAToken (WCFA)…`);
  const WCFA = await ethers.getContractFactory("WCFAToken");
  const wcfaArgs = [treasuryAddr, registryAddr, ""] as const;
  const wcfa = await WCFA.deploy(...wcfaArgs);
  await wcfa.waitForDeployment();
  const wcfaAddr = await wcfa.getAddress();
  console.log(`   ✅ ${wcfaAddr}`);

  // -----------------------------------------------------------------------
  // Save manifest
  // -----------------------------------------------------------------------
  const record: Batch3Record = {
    network: networkKey,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WrappedWTG: { address: wwtgAddr, constructorArgs: [...wwtgArgs] },
      WKEYToken:  { address: wkeyAddr, constructorArgs: [...wkeyArgs] },
      USDWToken:  { address: usdwAddr, constructorArgs: [...usdwArgs] },
      WCFAToken:  { address: wcfaAddr, constructorArgs: [...wcfaArgs] },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch3.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");
  console.log(`\n📝 Manifest sauvegardé : ${outPath}`);

  console.log(`\n🎯 Récap :`);
  console.log(`   WrappedWTG  ${wwtgAddr}`);
  console.log(`   WKEYToken   ${wkeyAddr}`);
  console.log(`   USDWToken   ${usdwAddr}`);
  console.log(`   WCFAToken   ${wcfaAddr}`);

  console.log(`\n⚙️  Actions multisig à faire ensuite :`);
  console.log(`   registry.setOfficialBatch([WWTG, WKEY, USDW, WCFA])`);
  console.log(`   → marque les 4 tokens en tier 3 (WintgOfficial / platine)`);
  console.log(`\n💡 Le treasury reçoit 30M WKEY initial (c'est lui qui déploie en mainnet/testnet ici).`);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
