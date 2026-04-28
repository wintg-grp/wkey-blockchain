/* eslint-disable no-console */
/**
 * deploy-batch4.ts — Déploiement Phase 1.8 (Batch 4 — Identity & Domains).
 *
 *   1. WtgDomainRegistryV2          — domains .wtg + reverse + subdomains
 *   2. ProfileRegistry              — profil public on-chain (avatar, bio, etc.)
 *   3. VerifiableCredentialsRegistry — VC W3C, Issuers (5000 WTG bond)
 *   4. SocialRecoveryModule         — module recovery 3-of-5 par défaut
 */

import { ethers, network } from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;
  const networkKey = network.name;

  console.log(`\n🌍 Réseau : ${networkKey} (chainId ${chainId})`);
  console.log(`👤 Deployer : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(await provider.getBalance(deployer.address))} WTG\n`);

  const phase1Path = resolve(__dirname, `../deployments/${networkKey}.json`);
  if (!existsSync(phase1Path)) { console.error(`❌ Phase 1 manquante`); process.exit(1); }
  const phase1 = JSON.parse(readFileSync(phase1Path, "utf-8"));
  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;

  console.log(`🏦 Treasury : ${treasuryAddr}\n`);

  console.log(`📦 1/4 — WtgDomainRegistryV2…`);
  const D = await ethers.getContractFactory("WtgDomainRegistryV2");
  const dArgs = [treasuryAddr, treasuryAddr] as const;
  const d = await D.deploy(...dArgs);
  await d.waitForDeployment();
  const dAddr = await d.getAddress();
  console.log(`   ✅ ${dAddr}`);

  console.log(`\n📦 2/4 — ProfileRegistry…`);
  const P = await ethers.getContractFactory("ProfileRegistry");
  const pArgs = [treasuryAddr] as const;
  const p = await P.deploy(...pArgs);
  await p.waitForDeployment();
  const pAddr = await p.getAddress();
  console.log(`   ✅ ${pAddr}`);

  console.log(`\n📦 3/4 — VerifiableCredentialsRegistry…`);
  const V = await ethers.getContractFactory("VerifiableCredentialsRegistry");
  const vArgs = [treasuryAddr, treasuryAddr] as const;
  const v = await V.deploy(...vArgs);
  await v.waitForDeployment();
  const vAddr = await v.getAddress();
  console.log(`   ✅ ${vAddr}`);

  console.log(`\n📦 4/4 — SocialRecoveryModule…`);
  const S = await ethers.getContractFactory("SocialRecoveryModule");
  const s = await S.deploy();
  await s.waitForDeployment();
  const sAddr = await s.getAddress();
  console.log(`   ✅ ${sAddr}`);

  const record = {
    network: networkKey, chainId: chainId.toString(), deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WtgDomainRegistryV2:           { address: dAddr, constructorArgs: [...dArgs] },
      ProfileRegistry:               { address: pAddr, constructorArgs: [...pArgs] },
      VerifiableCredentialsRegistry: { address: vAddr, constructorArgs: [...vArgs] },
      SocialRecoveryModule:          { address: sAddr, constructorArgs: [] },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch4.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 ${outPath}`);
  console.log(`\n🎯 Récap :`);
  console.log(`   WtgDomainRegistryV2            ${dAddr}`);
  console.log(`   ProfileRegistry                ${pAddr}`);
  console.log(`   VerifiableCredentialsRegistry  ${vAddr}`);
  console.log(`   SocialRecoveryModule           ${sAddr}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
