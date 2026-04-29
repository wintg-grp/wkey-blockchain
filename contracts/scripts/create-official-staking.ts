/* eslint-disable no-console */
/**
 * create-official-staking.ts — crée le pool de staking officiel WINTG :
 *   stake WWTG → reçoit WKEY en rewards
 *
 * Détails :
 *   - Stake token : WWTG (wrapped WTG, ERC-20)
 *   - Reward token : WKEY
 *   - Reward rate : ~0.01 WKEY / seconde initialement (ajustable via timelock 24h)
 *     ≈ 864 WKEY / jour ≈ 25 920 WKEY / mois
 *   - Lock period : 0 (pas de lock initialement)
 *   - Early withdrawal penalty : 0
 *
 *   Le treasury topup le pool avec 1M WKEY (≈ 39 jours de rewards)
 *   pour démarrer.
 *
 * Note : on utilise WWTG (pas WTG natif) parce que le `StakingPool`
 *        attend un IERC20. Les users devront wrap avant de staker.
 */

import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkKey = network.name;
  const provider = ethers.provider;

  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const batch5 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch5.json`), "utf-8"));

  const treasuryAddr = phase1.contracts.WINTGTreasury.address;
  const wwtg = batch3.contracts.WrappedWTG.address;
  const wkey = batch3.contracts.WKEYToken.address;
  const stakingFactoryAddr = batch5.contracts.StakingFactory.address;

  console.log(`\n🌍 ${networkKey}`);
  console.log(`🏦 Treasury : ${treasuryAddr}`);
  console.log(`🪙 Stake token (WWTG) : ${wwtg}`);
  console.log(`🎁 Reward token (WKEY) : ${wkey}`);
  console.log(`🏭 StakingFactory : ${stakingFactoryAddr}`);

  // Add deployer to team members so creation is free (we already did this on factory but need to verify)
  const factory = await ethers.getContractAt("StakingFactory", stakingFactoryAddr);
  const isTeam = await factory.isTeamMember(deployer.address);
  if (!isTeam) {
    console.log(`\n⚠️  Deployer pas team member. Le multisig doit l'ajouter.`);
    console.log(`   factory.addTeamMember(${deployer.address})`);
    return;
  }

  // Reward rate : 0.01 WKEY/sec = 1e16 wei/sec
  const rewardRate = ethers.parseEther("0.01");
  const lockSeconds = 0;
  const earlyPenaltyBps = 0;

  console.log(`\n📦 Création du pool staking officiel…`);
  const tx = await factory.createPool(wwtg, wkey, lockSeconds, earlyPenaltyBps, rewardRate, { value: 0 });
  const receipt = await tx.wait();
  const ev = receipt!.logs.find((l: any) => l.fragment?.name === "PoolCreated") as any;
  const poolAddr = ev.args[0];
  console.log(`   ✅ Pool créé : ${poolAddr}`);

  // Save in deployment manifest
  const officialPath = resolve(__dirname, `../deployments/${networkKey}-official.json`);
  let off: any = existsSync(officialPath) ? JSON.parse(readFileSync(officialPath, "utf-8")) : { network: networkKey, official: {} };
  off.official.OfficialStakingPool = {
    address: poolAddr,
    stakeToken: wwtg,
    rewardToken: wkey,
    rewardRate: rewardRate.toString(),
    note: "Stake WWTG → earn WKEY (0.01 WKEY/sec ≈ 864/day)"
  };
  writeFileSync(officialPath, JSON.stringify(off, null, 2), "utf-8");
  console.log(`📝 ${officialPath}`);

  console.log(`\n⚙️  Multisig actions ensuite :`);
  console.log(`   wkey.transfer(${poolAddr}, 1_000_000 ether)  — topup 1M WKEY initial reward pool`);
  console.log(`   (le pool peut ensuite distribuer des rewards aux stakers)`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
