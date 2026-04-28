/* eslint-disable no-console */
/**
 * deploy-batch5.ts — Déploiement Phase 1.9 (Batch 5 — DeFi).
 *
 *   1. TimelockEscrow      — anti-phishing transferts annulables
 *   2. LayawayEscrow       — paiement échelonné e-commerce
 *   3. StakingFactory      — factory de pools de staking (100 WTG)
 *   4. YieldFarmFactory    — factory de yield farms multi-rewards (100 WTG)
 *   5. WtgCfaPriceOracle   — oracle WTG/CFA initial 50 CFA
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
    if (b1.generatedAccounts?.verificationAdmin?.address) {
      verifAdmin = b1.generatedAccounts.verificationAdmin.address;
    }
  }

  console.log(`🏦 Treasury : ${treasuryAddr}`);
  console.log(`🔐 VerifAdmin: ${verifAdmin}\n`);

  console.log(`📦 1/5 — TimelockEscrow…`);
  const T = await ethers.getContractFactory("TimelockEscrow");
  const t = await T.deploy();
  await t.waitForDeployment();
  const tAddr = await t.getAddress();
  console.log(`   ✅ ${tAddr}`);

  console.log(`\n📦 2/5 — LayawayEscrow…`);
  const L = await ethers.getContractFactory("LayawayEscrow");
  const lArgs = [treasuryAddr, treasuryAddr] as const;
  const l = await L.deploy(...lArgs);
  await l.waitForDeployment();
  const lAddr = await l.getAddress();
  console.log(`   ✅ ${lAddr}`);

  console.log(`\n📦 3/5 — StakingFactory…`);
  const SF = await ethers.getContractFactory("StakingFactory");
  const sfArgs = [treasuryAddr, treasuryAddr, verifAdmin] as const;
  const sf = await SF.deploy(...sfArgs);
  await sf.waitForDeployment();
  const sfAddr = await sf.getAddress();
  console.log(`   ✅ ${sfAddr}`);

  console.log(`\n📦 4/5 — YieldFarmFactory…`);
  const YF = await ethers.getContractFactory("YieldFarmFactory");
  const yfArgs = [treasuryAddr, treasuryAddr, verifAdmin] as const;
  const yf = await YF.deploy(...yfArgs);
  await yf.waitForDeployment();
  const yfAddr = await yf.getAddress();
  console.log(`   ✅ ${yfAddr}`);

  console.log(`\n📦 5/5 — WtgCfaPriceOracle (50 CFA initial)…`);
  const O = await ethers.getContractFactory("WtgCfaPriceOracle");
  const oArgs = [treasuryAddr, deployer.address, 5_000_000_000n] as const;
  const o = await O.deploy(...oArgs);
  await o.waitForDeployment();
  const oAddr = await o.getAddress();
  console.log(`   ✅ ${oAddr}`);

  const record = {
    network: networkKey, chainId: chainId.toString(), deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      TimelockEscrow:    { address: tAddr,  constructorArgs: [] },
      LayawayEscrow:     { address: lAddr,  constructorArgs: [...lArgs] },
      StakingFactory:    { address: sfAddr, constructorArgs: [...sfArgs] },
      YieldFarmFactory:  { address: yfAddr, constructorArgs: [...yfArgs] },
      WtgCfaPriceOracle: { address: oAddr,  constructorArgs: oArgs.map(String) },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch5.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 ${outPath}`);
  console.log(`\n🎯 Récap :`);
  for (const [name, c] of Object.entries(record.contracts)) {
    console.log(`   ${name.padEnd(20)} ${(c as any).address}`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
