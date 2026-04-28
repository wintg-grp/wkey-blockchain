/* eslint-disable no-console */
/**
 * deploy-batch7.ts — Déploiement Batch 7 (Bridges).
 *
 *   1. EthBridgeAdapter  — bridge WINTG ↔ Ethereum
 *   2. BnbBridgeAdapter  — bridge WINTG ↔ BNB Chain
 *
 * Validators initiaux : 5 treasury signers + threshold 3 (3-of-5).
 * Limite max/tx : 100k WTG (équivalent ~5M CFA, à ajuster selon prix).
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

  // Validators = treasury signers (5)
  const validatorsRaw = process.env.TREASURY_SIGNERS;
  if (!validatorsRaw) { console.error("❌ TREASURY_SIGNERS env var manquant"); process.exit(1); }
  const validators = validatorsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const threshold = 3;
  const maxPerTx = ethers.parseEther("100000");

  console.log(`🏦 Treasury : ${treasuryAddr}`);
  console.log(`🛡  Validators (${validators.length}, threshold ${threshold}): ${validators.join(", ")}`);
  console.log(`📐 Max per tx: ${ethers.formatEther(maxPerTx)} WTG\n`);

  const ethRemote = ethers.keccak256(ethers.toUtf8Bytes("ethereum"));
  const bnbRemote = ethers.keccak256(ethers.toUtf8Bytes("bnb"));

  console.log(`📦 1/2 — EthBridgeAdapter…`);
  const Bridge = await ethers.getContractFactory("BridgeAdapter");
  const ethArgs = [treasuryAddr, ethRemote, validators, threshold, treasuryAddr, maxPerTx] as const;
  const ethBridge = await Bridge.deploy(...ethArgs);
  await ethBridge.waitForDeployment();
  const ethAddr = await ethBridge.getAddress();
  console.log(`   ✅ ${ethAddr}`);

  console.log(`\n📦 2/2 — BnbBridgeAdapter…`);
  const bnbArgs = [treasuryAddr, bnbRemote, validators, threshold, treasuryAddr, maxPerTx] as const;
  const bnbBridge = await Bridge.deploy(...bnbArgs);
  await bnbBridge.waitForDeployment();
  const bnbAddr = await bnbBridge.getAddress();
  console.log(`   ✅ ${bnbAddr}`);

  const record = {
    network: networkKey, chainId: chainId.toString(), deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      EthBridgeAdapter: { address: ethAddr, constructorArgs: ethArgs.map(String) },
      BnbBridgeAdapter: { address: bnbAddr, constructorArgs: bnbArgs.map(String) },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch7.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 ${outPath}`);
  console.log(`\n🎯 Récap :`);
  console.log(`   EthBridgeAdapter  ${ethAddr}`);
  console.log(`   BnbBridgeAdapter  ${bnbAddr}`);
  console.log(`\n⚙️  Prochaines étapes :`);
  console.log(`   - multisig: setSupportedToken(WWTG, true) + autres tokens à bridger`);
  console.log(`   - déployer le contrat miroir sur Ethereum + BNB Chain`);
  console.log(`   - lancer un worker validator par validator`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
