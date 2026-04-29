/* eslint-disable no-console */
/**
 * setup-faucet.ts — configure le WintgFaucet (TESTNET only) avec :
 *   - Drip WTG natif (depuis deployer topup)
 *   - Drip WKEY (depuis treasury via multisig)
 *
 * Les autres tokens (WWTG, USDW, WCFA) seront ajoutés plus tard via
 * wrap/vault mints.
 */

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const networkKey = network.name;
  if (networkKey !== "wintgTestnet") {
    console.error("Faucet only on testnet (sécurité)."); process.exit(1);
  }
  const [deployer] = await ethers.getSigners();

  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const batch8 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch8.json`), "utf-8"));

  const treasuryAddr = phase1.contracts.WINTGTreasury.address;
  const faucetAddr   = batch8.contracts.WintgFaucet.address;
  const wkey = batch3.contracts.WKEYToken.address;

  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);
  const faucet = await ethers.getContractAt("WintgFaucet", faucetAddr);

  const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  console.log(`\n🚰 Configuring faucet ${faucetAddr} on ${networkKey}\n`);

  // ---- 1. setDrip native (100 WTG / 24h) via multisig ----
  const dripNative = await faucet.drips(NATIVE);
  if (!dripNative.active || dripNative.amountPerClaim !== ethers.parseEther("100")) {
    console.log(`▶ multisig: setDrip(NATIVE WTG, 100 / 24h)`);
    let data = faucet.interface.encodeFunctionData("setDrip", [NATIVE, ethers.parseEther("100"), 86400, true]);
    await executeMultisigCall({
      treasury: treasury as any, to: faucetAddr, value: 0n, data, threshold, signers,
      description: "setDrip(WTG natif, 100, 24h)",
    });
  } else {
    console.log(`✓ WTG natif drip déjà actif`);
  }

  // ---- 2. setDrip WKEY (1000 WKEY / 24h) via multisig ----
  const dripWkey = await faucet.drips(wkey);
  if (!dripWkey.active || dripWkey.amountPerClaim !== ethers.parseEther("1000")) {
    console.log(`\n▶ multisig: setDrip(WKEY, 1000 / 24h)`);
    let data = faucet.interface.encodeFunctionData("setDrip", [wkey, ethers.parseEther("1000"), 86400, true]);
    await executeMultisigCall({
      treasury: treasury as any, to: faucetAddr, value: 0n, data, threshold, signers,
      description: "setDrip(WKEY, 1000, 24h)",
    });
  } else {
    console.log(`✓ WKEY drip déjà actif`);
  }

  // ---- 3. Topup native (1000 WTG depuis deployer) ----
  const bal = await ethers.provider.getBalance(faucetAddr);
  if (bal < ethers.parseEther("500")) {
    console.log(`\n▶ deployer: faucet receive 1000 WTG`);
    const tx = await deployer.sendTransaction({ to: faucetAddr, value: ethers.parseEther("1000") });
    await tx.wait();
    console.log(`   ✓ topup native done`);
  } else {
    console.log(`✓ Faucet a déjà ${ethers.formatEther(bal)} WTG natif`);
  }

  // ---- 4. Topup WKEY (100k WKEY depuis treasury via multisig) ----
  const wkeyToken = new ethers.Contract(wkey, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], ethers.provider);
  const balWkey = await wkeyToken.balanceOf(faucetAddr);
  if (balWkey < ethers.parseEther("50000")) {
    console.log(`\n▶ multisig: treasury.transfer(WKEY, faucet, 100_000)`);
    const data = (new ethers.Interface(["function transfer(address,uint256)"])).encodeFunctionData("transfer", [faucetAddr, ethers.parseEther("100000")]);
    await executeMultisigCall({
      treasury: treasury as any, to: wkey, value: 0n, data, threshold, signers,
      description: "treasury.transfer(WKEY, faucet, 100k)",
    });
  } else {
    console.log(`✓ Faucet a déjà ${ethers.formatEther(balWkey)} WKEY`);
  }

  console.log(`\n✅ Faucet configuré.`);
  console.log(`   Drips actifs : WTG natif (100 / 24h), WKEY (1000 / 24h)`);
  console.log(`   Reserve : ${ethers.formatEther(await ethers.provider.getBalance(faucetAddr))} WTG natif`);
  console.log(`   Reserve : ${ethers.formatEther(await wkeyToken.balanceOf(faucetAddr))} WKEY`);
}

main().catch(e => { console.error("❌", e); process.exit(1); });
