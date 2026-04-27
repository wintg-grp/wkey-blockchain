/**
 * deploy-local.ts — Déploiement simplifié pour les chaînes locales (Hardhat
 * node OU Besu local Docker). Pas de vérification CREATE-address strict, pas
 * de check de pré-allocation : juste déployer et sauvegarder.
 *
 * Usage :
 *   # Hardhat node (pure)
 *   npx hardhat node                                          # terminal 1
 *   npx hardhat run scripts/deploy-local.ts --network localhost  # terminal 2
 *
 *   # Besu local Docker (réaliste)
 *   docker compose -f ../docker-compose.local.yml up -d
 *   npx hardhat run scripts/deploy-local.ts --network local
 */

import { ethers, network } from "hardhat";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🌍 Réseau : ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`👤 Deployer : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} WTG\n`);

  const ONE = 10n ** 18n;
  const tge = Math.floor(Date.now() / 1000);
  const addresses: Record<string, string> = {};

  console.log("⚙️  Déploiement (ordre simplifié)...");

  // 1. Token wrapper
  const WTG = await ethers.getContractFactory("WTGToken");
  const wtg = await WTG.deploy();
  await wtg.waitForDeployment();
  addresses.WTGToken = await wtg.getAddress();
  console.log(`  ✓ WTGToken               ${addresses.WTGToken}`);

  // 2. Multisig Treasury (3-of-3 = deployer pour simplicité dev)
  const Treasury = await ethers.getContractFactory("WINTGTreasury");
  const treasuryMultisig = await Treasury.deploy([deployer.address], 1);
  await treasuryMultisig.waitForDeployment();
  addresses.WINTGTreasury = await treasuryMultisig.getAddress();
  console.log(`  ✓ WINTGTreasury          ${addresses.WINTGTreasury}`);

  // 3. Burn + FeeDistributor
  const Burn = await ethers.getContractFactory("BurnContract");
  const burn = await Burn.deploy();
  await burn.waitForDeployment();
  addresses.BurnContract = await burn.getAddress();
  console.log(`  ✓ BurnContract           ${addresses.BurnContract}`);

  const Distrib = await ethers.getContractFactory("FeeDistributor");
  const distrib = await Distrib.deploy(
    addresses.WINTGTreasury,        // owner
    addresses.WINTGTreasury,        // treasury (40 %)
    deployer.address,               // validator pool (50 %)
    addresses.BurnContract,         // burn (5 %)
    addresses.WINTGTreasury,        // community pool (5 %) — default to Treasury locally
  );
  await distrib.waitForDeployment();
  addresses.FeeDistributor = await distrib.getAddress();
  console.log(`  ✓ FeeDistributor         ${addresses.FeeDistributor}`);

  // 4. Vestings (allocations réduites pour tests)
  const SMALL = 1000n * ONE;
  const Public = await ethers.getContractFactory("PublicSaleVesting");
  const pub = await Public.deploy(deployer.address, tge, SMALL);
  await pub.waitForDeployment();
  addresses.PublicSaleVesting = await pub.getAddress();
  console.log(`  ✓ PublicSaleVesting      ${addresses.PublicSaleVesting}`);

  const Team = await ethers.getContractFactory("TeamVesting");
  const team = await Team.deploy(deployer.address, deployer.address, tge, SMALL);
  await team.waitForDeployment();
  addresses.TeamVesting = await team.getAddress();
  console.log(`  ✓ TeamVesting            ${addresses.TeamVesting}`);

  // 5. Staking + Reserve (reserve owner = staking pour rate-limit)
  const ownerNonce = await ethers.provider.getTransactionCount(deployer.address);
  const stakingFutureAddr = ethers.getCreateAddress({ from: deployer.address, nonce: ownerNonce + 1 });

  const Reserve = await ethers.getContractFactory("StakingRewardsReserve");
  const reserve = await Reserve.deploy(stakingFutureAddr, 1_000n * ONE);
  await reserve.waitForDeployment();
  addresses.StakingRewardsReserve = await reserve.getAddress();
  console.log(`  ✓ StakingRewardsReserve  ${addresses.StakingRewardsReserve}`);
  await deployer.sendTransaction({ to: addresses.StakingRewardsReserve, value: 1_000n * ONE });

  const Staking = await ethers.getContractFactory("WINTGStaking");
  const staking = await Staking.deploy(deployer.address, addresses.StakingRewardsReserve, ONE / 10n, 3600n);
  await staking.waitForDeployment();
  addresses.WINTGStaking = await staking.getAddress();
  console.log(`  ✓ WINTGStaking           ${addresses.WINTGStaking}`);

  // 6. Governance
  const Timelock = await ethers.getContractFactory("WINTGTimelock");
  const timelock = await Timelock.deploy(60, [deployer.address], [deployer.address], deployer.address);
  await timelock.waitForDeployment();
  addresses.WINTGTimelock = await timelock.getAddress();
  console.log(`  ✓ WINTGTimelock          ${addresses.WINTGTimelock}`);

  const Gov = await ethers.getContractFactory("WINTGGovernor");
  const gov = await Gov.deploy(addresses.WTGToken, addresses.WINTGTimelock, 1, 50, 0, 4);
  await gov.waitForDeployment();
  addresses.WINTGGovernor = await gov.getAddress();
  console.log(`  ✓ WINTGGovernor          ${addresses.WINTGGovernor}`);

  // 7. DEX
  const Factory = await ethers.getContractFactory("WINTGFactory");
  const factory = await Factory.deploy(deployer.address, deployer.address);
  await factory.waitForDeployment();
  addresses.WINTGFactory = await factory.getAddress();
  console.log(`  ✓ WINTGFactory           ${addresses.WINTGFactory}`);

  const Router = await ethers.getContractFactory("WINTGRouter");
  const router = await Router.deploy(addresses.WINTGFactory, addresses.WTGToken);
  await router.waitForDeployment();
  addresses.WINTGRouter = await router.getAddress();
  console.log(`  ✓ WINTGRouter            ${addresses.WINTGRouter}`);

  // 8. Bridge
  const Bridge = await ethers.getContractFactory("WINTGBridge");
  const bridge = await Bridge.deploy(deployer.address, [deployer.address], 1);
  await bridge.waitForDeployment();
  addresses.WINTGBridge = await bridge.getAddress();
  console.log(`  ✓ WINTGBridge            ${addresses.WINTGBridge}`);

  // 9. Oracle
  const Oracle = await ethers.getContractFactory("OracleAggregator");
  const oracle = await Oracle.deploy(deployer.address, 8, "WTG/USD", 600, 5000);
  await oracle.waitForDeployment();
  addresses.OracleAggregator = await oracle.getAddress();
  console.log(`  ✓ OracleAggregator       ${addresses.OracleAggregator}`);

  // 10. Multicall + ValidatorRegistry
  const Multi = await ethers.getContractFactory("Multicall3");
  const multi = await Multi.deploy();
  await multi.waitForDeployment();
  addresses.Multicall3 = await multi.getAddress();
  console.log(`  ✓ Multicall3             ${addresses.Multicall3}`);

  // ValidatorRegistry needs a price feed for USD-denominated bonds.
  // For local dev we wire up the same OracleAggregator deployed above —
  // operators can be set later. minBondUsd = 10 USD (8 decimals).
  const Reg = await ethers.getContractFactory("ValidatorRegistry");
  const reg = await Reg.deploy(
    deployer.address,
    addresses.OracleAggregator,
    addresses.WINTGTreasury,
    10n * 10n ** 8n,
  );
  await reg.waitForDeployment();
  addresses.ValidatorRegistry = await reg.getAddress();
  console.log(`  ✓ ValidatorRegistry      ${addresses.ValidatorRegistry}`);

  // 11. NFT examples
  const NFT = await ethers.getContractFactory("WINTGNFT");
  const nft = await NFT.deploy("WINTG Genesis", "WGEN", deployer.address, deployer.address, 500);
  await nft.waitForDeployment();
  addresses.WINTGNFT = await nft.getAddress();
  console.log(`  ✓ WINTGNFT (ERC-721)     ${addresses.WINTGNFT}`);

  const Coll = await ethers.getContractFactory("WINTGCollection");
  const coll = await Coll.deploy("WINTG Items", "WITM", "ipfs://meta/{id}.json", deployer.address, deployer.address, 250);
  await coll.waitForDeployment();
  addresses.WINTGCollection = await coll.getAddress();
  console.log(`  ✓ WINTGCollection (1155) ${addresses.WINTGCollection}`);

  // 12. ERC20Factory (création publique de tokens ERC-20)
  const ERC20Fac = await ethers.getContractFactory("ERC20Factory");
  const erc20Factory = await ERC20Fac.deploy(
    deployer.address, addresses.WINTGTreasury, 100n * ONE,    // 100 WTG par création
  );
  await erc20Factory.waitForDeployment();
  addresses.ERC20Factory = await erc20Factory.getAddress();
  console.log(`  ✓ ERC20Factory           ${addresses.ERC20Factory}`);

  // 13. NFTFactory (création publique de NFT ERC-721 / ERC-1155)
  const NFTFac = await ethers.getContractFactory("NFTFactory");
  const nftFactory = await NFTFac.deploy(
    deployer.address, addresses.WINTGTreasury,
    50n * ONE, 50n * ONE,                                     // 50 WTG par collection
  );
  await nftFactory.waitForDeployment();
  addresses.NFTFactory = await nftFactory.getAddress();
  console.log(`  ✓ NFTFactory             ${addresses.NFTFactory}`);

  // Save
  const outDir = resolve(__dirname, "..", "deployments");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${network.name}-local.json`);
  writeFileSync(outPath, JSON.stringify({
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: addresses,
  }, null, 2) + "\n");

  console.log(`\n✅ ${Object.keys(addresses).length} contrats déployés.`);
  console.log(`💾 ${outPath}`);
  console.log(`\n👉 Connecter MetaMask :`);
  console.log(`   RPC      : ${(network.config as any).url ?? "http://127.0.0.1:8545"}`);
  console.log(`   ChainID  : ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`   Symbol   : WTG`);
  console.log(`   Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (clé connue Hardhat)\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
