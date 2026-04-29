/* eslint-disable no-console */
/**
 * setup-official-staking.ts — flow complet pour créer le staking pool
 * officiel WINTG en une seule exécution :
 *   1. Multisig: factory.addTeamMember(deployer) — pour créer gratuit
 *   2. Deployer: factory.createPool(WWTG → WKEY)
 *   3. Multisig: wkey.transfer(pool, 1M WKEY) — topup reward pool
 *
 * Usage :
 *   WALLETS_PASSPHRASE=... npx hardhat run scripts/setup-official-staking.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkKey = network.name;

  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const batch5 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch5.json`), "utf-8"));

  const treasuryAddr = phase1.contracts.WINTGTreasury.address;
  const wwtg = batch3.contracts.WrappedWTG.address;
  const wkey = batch3.contracts.WKEYToken.address;
  const stakingFactoryAddr = batch5.contracts.StakingFactory.address;

  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const factory  = await ethers.getContractAt("StakingFactory", stakingFactoryAddr);
  const wkeyToken = await ethers.getContractAt("WKEYToken", wkey);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);

  console.log(`\n🌍 ${networkKey}`);

  // ---- Step 1 : multisig add deployer as team member ----
  const isTeam = await factory.isTeamMember(deployer.address);
  if (!isTeam) {
    console.log(`▶ 1/3 multisig: factory.addTeamMember(${deployer.address})`);
    const data = factory.interface.encodeFunctionData("addTeamMember", [deployer.address]);
    await executeMultisigCall({
      treasury: treasury as any, to: stakingFactoryAddr, value: 0n, data,
      threshold, signers, description: "factory.addTeamMember(deployer)",
    });
  } else {
    console.log(`✓ deployer déjà team member`);
  }

  // ---- Step 2 : deployer create the pool (free) ----
  console.log(`\n▶ 2/3 deployer: factory.createPool(WWTG → WKEY)`);
  const rewardRate = ethers.parseEther("0.01"); // 0.01 WKEY/sec
  const tx = await factory.createPool(wwtg, wkey, 0, 0, rewardRate, { value: 0 });
  const receipt = await tx.wait();
  const ev = receipt!.logs.find((l: any) => l.fragment?.name === "PoolCreated") as any;
  const poolAddr = ev.args[0];
  console.log(`   ✅ Pool : ${poolAddr}`);

  // ---- Step 3 : multisig topup pool with 1M WKEY ----
  const topupAmount = ethers.parseEther("1000000");
  console.log(`\n▶ 3/3 multisig: wkey.transfer(${poolAddr}, 1_000_000 WKEY)`);
  const dataTopup = wkeyToken.interface.encodeFunctionData("transfer", [poolAddr, topupAmount]);
  await executeMultisigCall({
    treasury: treasury as any, to: wkey, value: 0n, data: dataTopup,
    threshold, signers, description: `wkey.transfer(pool, 1M)`,
  });

  // Save in manifest
  const officialPath = resolve(__dirname, `../deployments/${networkKey}-official.json`);
  let off: any = existsSync(officialPath) ? JSON.parse(readFileSync(officialPath, "utf-8")) : { network: networkKey, official: {} };
  off.official.OfficialStakingPool = {
    address: poolAddr,
    stakeToken: wwtg,
    rewardToken: wkey,
    rewardRate: rewardRate.toString(),
    initialRewardTopup: topupAmount.toString(),
    note: "Stake WWTG → earn WKEY (0.01 WKEY/sec ≈ 864/day)"
  };
  writeFileSync(officialPath, JSON.stringify(off, null, 2), "utf-8");

  console.log(`\n✅ Pool staking officiel créé et topupé.`);
  console.log(`   Stake WWTG sur : ${poolAddr}`);
  console.log(`   Reward rate : 0.01 WKEY/sec ≈ 864 WKEY/day`);
  console.log(`   Initial reward pool : 1M WKEY ≈ 39 jours`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
