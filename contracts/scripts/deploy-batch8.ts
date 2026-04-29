/* eslint-disable no-console */
/**
 * deploy-batch8.ts — DeFi bootstrap Phase 1.12
 *
 *   1. WintgPriceAdmin       — prix admin centralisé
 *   2. LiquidityReserveVault — accumule WTG/WKEY pour future pool DEX
 *   3. SubscriptionPayment   — paiements avec discount crypto
 *   4. WintgFaucet           — distribue tokens testnet (signed claims)
 *   5. USDWVault             — collat 150% WTG → mint USDW
 *   6. WCFAVault             — collat 150% WTG → mint WCFA
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

  // Phase 1 manifest
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;
  // Batch 3 official tokens
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const wtgNativeAddr = "0xEeeeeEeeeEeEeeEeEeEeeEEEeEeeeEeeeeeeEEeE"; // We'll use WWTG as proxy for WTG payments

  const wwtgAddr: string = batch3.contracts.WrappedWTG.address;
  const wkeyAddr: string = batch3.contracts.WKEYToken.address;
  const usdwAddr: string = batch3.contracts.USDWToken.address;
  const wcfaAddr: string = batch3.contracts.WCFAToken.address;

  // Batch 1 verification admin (signer for faucet)
  const batch1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch1.json`), "utf-8"));
  const verifAdmin = batch1.generatedAccounts?.verificationAdmin?.address ?? deployer.address;

  console.log(`🏦 Treasury : ${treasuryAddr}`);
  console.log(`🪙 WWTG : ${wwtgAddr}`);
  console.log(`🔑 WKEY : ${wkeyAddr}`);
  console.log(`💵 USDW : ${usdwAddr}`);
  console.log(`💴 WCFA : ${wcfaAddr}`);
  console.log(`🔐 Faucet signer (verifAdmin) : ${verifAdmin}\n`);

  // -----------------------------------------------------------------------
  // 1) WintgPriceAdmin
  // -----------------------------------------------------------------------
  console.log(`📦 1/6 — WintgPriceAdmin…`);
  const PA = await ethers.getContractFactory("WintgPriceAdmin");
  const pa = await PA.deploy(treasuryAddr);
  await pa.waitForDeployment();
  const paAddr = await pa.getAddress();
  console.log(`   ✅ ${paAddr}`);

  // -----------------------------------------------------------------------
  // 2) LiquidityReserveVault
  // -----------------------------------------------------------------------
  console.log(`\n📦 2/6 — LiquidityReserveVault…`);
  const LRV = await ethers.getContractFactory("LiquidityReserveVault");
  const lrv = await LRV.deploy(treasuryAddr);
  await lrv.waitForDeployment();
  const lrvAddr = await lrv.getAddress();
  console.log(`   ✅ ${lrvAddr}`);

  // -----------------------------------------------------------------------
  // 3) SubscriptionPayment
  // -----------------------------------------------------------------------
  console.log(`\n📦 3/6 — SubscriptionPayment…`);
  const SP = await ethers.getContractFactory("SubscriptionPayment");
  const sp = await SP.deploy(treasuryAddr, paAddr, lrvAddr);
  await sp.waitForDeployment();
  const spAddr = await sp.getAddress();
  console.log(`   ✅ ${spAddr}`);

  // -----------------------------------------------------------------------
  // 4) WintgFaucet
  // -----------------------------------------------------------------------
  console.log(`\n📦 4/6 — WintgFaucet…`);
  const F = await ethers.getContractFactory("WintgFaucet");
  const fct = await F.deploy(treasuryAddr, verifAdmin);
  await fct.waitForDeployment();
  const fctAddr = await fct.getAddress();
  console.log(`   ✅ ${fctAddr}`);

  // -----------------------------------------------------------------------
  // 5) USDWVault
  // -----------------------------------------------------------------------
  console.log(`\n📦 5/6 — USDWVault…`);
  const USDWV = await ethers.getContractFactory("USDWVault");
  // Use WWTG as collateral (since WTG natif is not an ERC20 we can call transferFrom on)
  const usdwArgs = [treasuryAddr, wwtgAddr, usdwAddr, paAddr, treasuryAddr, ethers.parseEther("100000")] as const;
  const usdwV = await USDWV.deploy(...usdwArgs);
  await usdwV.waitForDeployment();
  const usdwVAddr = await usdwV.getAddress();
  console.log(`   ✅ ${usdwVAddr}`);

  // -----------------------------------------------------------------------
  // 6) WCFAVault
  // -----------------------------------------------------------------------
  console.log(`\n📦 6/6 — WCFAVault…`);
  const WCFAV = await ethers.getContractFactory("WCFAVault");
  const wcfaArgs = [treasuryAddr, wwtgAddr, wcfaAddr, paAddr, treasuryAddr, ethers.parseEther("50000000")] as const;
  const wcfaV = await WCFAV.deploy(...wcfaArgs);
  await wcfaV.waitForDeployment();
  const wcfaVAddr = await wcfaV.getAddress();
  console.log(`   ✅ ${wcfaVAddr}`);

  // -----------------------------------------------------------------------
  // Save manifest
  // -----------------------------------------------------------------------
  const record = {
    network: networkKey,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WintgPriceAdmin:        { address: paAddr,    constructorArgs: [treasuryAddr] },
      LiquidityReserveVault:  { address: lrvAddr,   constructorArgs: [treasuryAddr] },
      SubscriptionPayment:    { address: spAddr,    constructorArgs: [treasuryAddr, paAddr, lrvAddr] },
      WintgFaucet:            { address: fctAddr,   constructorArgs: [treasuryAddr, verifAdmin] },
      USDWVault:              { address: usdwVAddr, constructorArgs: [...usdwArgs].map(String) },
      WCFAVault:              { address: wcfaVAddr, constructorArgs: [...wcfaArgs].map(String) },
    },
  };
  const outPath = resolve(__dirname, `../deployments/${networkKey}-batch8.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 ${outPath}`);
  console.log(`\n🎯 Récap :`);
  for (const [name, c] of Object.entries(record.contracts)) {
    console.log(`   ${name.padEnd(24)} ${(c as any).address}`);
  }

  console.log(`\n⚙️  Actions multisig à faire ensuite :`);
  console.log(`   priceAdmin.setPriceBatch([WWTG=500000, WKEY=200000, USDW=6000000, WCFA=10000])`);
  console.log(`     (= WTG@50CFA, WKEY@20CFA, USDW@600CFA, WCFA@1CFA)`);
  console.log(`   subscriptionPayment.setAcceptedToken(WWTG/WKEY/USDW/WCFA, true)`);
  console.log(`   subscriptionPayment.createPlan(...) — plans concrets`);
  console.log(`   USDW.grantRole(MINTER_ROLE, USDWVault)  — pour permettre le mint`);
  console.log(`   WCFA.grantRole(MINTER_ROLE, WCFAVault)  — idem`);
  console.log(`   faucet.setDrip(...) pour chaque token + topup initial`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
