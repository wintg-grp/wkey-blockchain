/* eslint-disable no-console */
/**
 * deploy-batch6.ts — Déploiement Phase 1.10 (Batch 6 — Apps & Infra).
 *
 *   1. AppRegistry      — registry des dApps WINTG (50 WTG fee)
 *   2. WintgPaymaster   — sponsorise gas via meta-tx (verifying paymaster)
 *   3. Multicall3       — utility batch reads/writes (déjà existant, redéployé)
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

  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;

  const batch1Path = resolve(__dirname, `../deployments/${networkKey}-batch1.json`);
  let verifAdmin = treasuryAddr;
  if (existsSync(batch1Path)) {
    const b1 = JSON.parse(readFileSync(batch1Path, "utf-8"));
    if (b1.generatedAccounts?.verificationAdmin?.address) verifAdmin = b1.generatedAccounts.verificationAdmin.address;
  }

  console.log(`🏦 Treasury    : ${treasuryAddr}`);
  console.log(`🔐 VerifAdmin : ${verifAdmin}\n`);

  console.log(`📦 1/3 — AppRegistry…`);
  const AR = await ethers.getContractFactory("AppRegistry");
  const arArgs = [treasuryAddr, treasuryAddr, verifAdmin] as const;
  const ar = await AR.deploy(...arArgs);
  await ar.waitForDeployment();
  const arAddr = await ar.getAddress();
  console.log(`   ✅ ${arAddr}`);

  console.log(`\n📦 2/3 — WintgPaymaster…`);
  const PM = await ethers.getContractFactory("WintgPaymaster");
  const pmArgs = [treasuryAddr, verifAdmin, treasuryAddr] as const;
  const pm = await PM.deploy(...pmArgs);
  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();
  console.log(`   ✅ ${pmAddr}`);

  console.log(`\n📦 3/3 — Multicall3…`);
  const M3 = await ethers.getContractFactory("Multicall3");
  const m3 = await M3.deploy();
  await m3.waitForDeployment();
  const m3Addr = await m3.getAddress();
  console.log(`   ✅ ${m3Addr}`);

  const record = {
    network: networkKey, chainId: chainId.toString(), deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      AppRegistry:    { address: arAddr,  constructorArgs: [...arArgs] },
      WintgPaymaster: { address: pmAddr,  constructorArgs: [...pmArgs] },
      Multicall3:     { address: m3Addr,  constructorArgs: [] },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch6.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 ${outPath}`);
  console.log(`\n🎯 Récap :`);
  console.log(`   AppRegistry      ${arAddr}`);
  console.log(`   WintgPaymaster   ${pmAddr}`);
  console.log(`   Multicall3       ${m3Addr}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
