/* eslint-disable no-console */
/**
 * multisig-batch8-configs.ts — Configurations multisig post-Batch 8
 *
 * Actions:
 *  1. priceAdmin.setPriceBatch([WWTG, WKEY, USDW, WCFA])
 *  2. subscription.setAcceptedToken(WWTG, WKEY, USDW, WCFA, true)
 *  3. USDWToken.grantRole(MINTER_ROLE, USDWVault)
 *  4. WCFAToken.grantRole(MINTER_ROLE, WCFAVault)
 *  5. Bridges.setSupportedToken (WWTG, WKEY, USDW, WCFA) — both ETH + BNB
 *  6. ChainMeta.setBridgeURLs(["https://bridge.wintg.network"])
 *  7. Premium domains reservation (a-z + top names)
 *  8. Paymaster topup 1000 WTG
 *
 * Usage:
 *   WALLETS_PASSPHRASE=... npx hardhat run scripts/multisig-batch8-configs.ts --network wintgTestnet
 *   WALLETS_PASSPHRASE=... npx hardhat run scripts/multisig-batch8-configs.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const networkKey = network.name;
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const batch1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch1.json`), "utf-8"));
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const batch4 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch4.json`), "utf-8"));
  const batch6 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch6.json`), "utf-8"));
  const batch7 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch7.json`), "utf-8"));
  const batch8 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch8.json`), "utf-8"));

  const treasuryAddr = phase1.contracts.WINTGTreasury.address;
  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);

  console.log(`\n🌍 Réseau : ${networkKey}`);
  console.log(`🏦 Treasury (multisig) : ${treasuryAddr}`);
  console.log(`🔐 Threshold ${threshold}-of-${signers.length}\n`);

  // Token addresses
  const wwtg = batch3.contracts.WrappedWTG.address;
  const wkey = batch3.contracts.WKEYToken.address;
  const usdw = batch3.contracts.USDWToken.address;
  const wcfa = batch3.contracts.WCFAToken.address;

  // ---------- 1) PriceAdmin.setPriceBatch ----------
  console.log(`▶ 1/8 — priceAdmin.setPriceBatch (50/20/600/1 CFA)`);
  const priceAdmin = await ethers.getContractAt("WintgPriceAdmin", batch8.contracts.WintgPriceAdmin.address);
  // Prices in CFA × 10_000:  WWTG=500000  WKEY=200000  USDW=6000000  WCFA=10000
  const tokens = [wwtg, wkey, usdw, wcfa];
  const prices = [500_000n, 200_000n, 6_000_000n, 10_000n];
  let data = priceAdmin.interface.encodeFunctionData("setPriceBatch", [tokens, prices]);
  await executeMultisigCall({
    treasury: treasury as any, to: await priceAdmin.getAddress(), value: 0n, data,
    threshold, signers, description: "priceAdmin.setPriceBatch",
  });

  // ---------- 2) Subscription.setAcceptedToken ----------
  console.log(`\n▶ 2/8 — subscription.setAcceptedToken × 4`);
  const sub = await ethers.getContractAt("SubscriptionPayment", batch8.contracts.SubscriptionPayment.address);
  for (const t of tokens) {
    data = sub.interface.encodeFunctionData("setAcceptedToken", [t, true]);
    await executeMultisigCall({
      treasury: treasury as any, to: await sub.getAddress(), value: 0n, data,
      threshold, signers, description: `subscription.setAcceptedToken(${t.slice(0,8)}…, true)`,
    });
  }

  // ---------- 3) USDWToken.grantRole(MINTER_ROLE, USDWVault) ----------
  console.log(`\n▶ 3/8 — USDW.grantRole(MINTER_ROLE, USDWVault)`);
  const usdwToken = await ethers.getContractAt("USDWToken", usdw);
  const MINTER_ROLE = ethers.id("MINTER_ROLE");
  data = usdwToken.interface.encodeFunctionData("grantRole", [MINTER_ROLE, batch8.contracts.USDWVault.address]);
  await executeMultisigCall({
    treasury: treasury as any, to: usdw, value: 0n, data, threshold, signers,
    description: "USDW.grantRole(MINTER_ROLE, USDWVault)",
  });

  // ---------- 4) WCFAToken.grantRole(MINTER_ROLE, WCFAVault) ----------
  console.log(`\n▶ 4/8 — WCFA.grantRole(MINTER_ROLE, WCFAVault)`);
  const wcfaToken = await ethers.getContractAt("WCFAToken", wcfa);
  data = wcfaToken.interface.encodeFunctionData("grantRole", [MINTER_ROLE, batch8.contracts.WCFAVault.address]);
  await executeMultisigCall({
    treasury: treasury as any, to: wcfa, value: 0n, data, threshold, signers,
    description: "WCFA.grantRole(MINTER_ROLE, WCFAVault)",
  });

  // ---------- 5) Bridges.setSupportedToken ----------
  console.log(`\n▶ 5/8 — Bridges.setSupportedToken × 8 (4 tokens × 2 bridges)`);
  const ethBridge = await ethers.getContractAt("BridgeAdapter", batch7.contracts.EthBridgeAdapter.address);
  const bnbBridge = await ethers.getContractAt("BridgeAdapter", batch7.contracts.BnbBridgeAdapter.address);
  for (const bridge of [ethBridge, bnbBridge]) {
    for (const t of tokens) {
      const supported = await bridge.isSupportedToken(t);
      if (supported) {
        console.log(`   skip ${await bridge.getAddress()} ${t.slice(0,8)}… already supported`);
        continue;
      }
      data = bridge.interface.encodeFunctionData("setSupportedToken", [t, true]);
      await executeMultisigCall({
        treasury: treasury as any, to: await bridge.getAddress(), value: 0n, data,
        threshold, signers, description: `bridge.setSupportedToken(${t.slice(0,8)}…)`,
      });
    }
  }

  // ---------- 6) ChainMeta.setBridgeURLs ----------
  console.log(`\n▶ 6/8 — chainMeta.setBridgeURLs(["https://bridge.wintg.network"])`);
  const chainMeta = await ethers.getContractAt("WintgChainMetadata", batch1.contracts.WintgChainMetadata.address);
  data = chainMeta.interface.encodeFunctionData("setBridgeURLs", [["https://bridge.wintg.network"]]);
  await executeMultisigCall({
    treasury: treasury as any, to: await chainMeta.getAddress(), value: 0n, data, threshold, signers,
    description: "chainMeta.setBridgeURLs",
  });

  // ---------- 7) Premium domains ----------
  console.log(`\n▶ 7/8 — domain.reservePremium (top names)`);
  const domain = await ethers.getContractAt("WtgDomainRegistryV2", batch4.contracts.WtgDomainRegistryV2.address);
  const premium = ["wintg", "wkey", "wcfa", "usdw", "wwtg", "scan", "rpc", "bridge", "dex", "swap", "stake", "farm", "bank", "pay", "shop", "togo", "uemoa", "africa", "lome"];
  data = domain.interface.encodeFunctionData("reservePremium", [premium]);
  await executeMultisigCall({
    treasury: treasury as any, to: await domain.getAddress(), value: 0n, data, threshold, signers,
    description: `domain.reservePremium(${premium.length} names)`,
  });

  // ---------- 8) Paymaster topup (skipped — treasury empty) ----------
  console.log(`\n▶ 8/8 — paymaster topup SKIPPED`);
  console.log(`   (Treasury n'a pas encore de WTG accumulé. À faire plus tard depuis le deployer:`);
  console.log(`     deployer.sendTransaction({ to: ${batch6.contracts.WintgPaymaster.address}, value: 100e18 }))`);

  console.log(`\n✅ Toutes les configs multisig Batch 8 appliquées.`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
