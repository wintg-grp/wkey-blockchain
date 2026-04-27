/* eslint-disable no-console */
/**
 * deploy.ts — Déploiement complet des smart contracts WINTG.
 *
 * Ordre obligatoire (figé par generate-genesis.ts) :
 *   nonce 0 : PublicSaleVesting
 *   nonce 1 : PrivateSaleVesting
 *   nonce 2 : TeamVesting
 *   nonce 3 : AdvisorsVesting
 *   nonce 4 : EcosystemVesting
 *   nonce 5 : AirdropVesting
 *   nonce 6 : StakingRewardsReserve
 *   nonce 7 : TreasuryVesting
 *   nonce 8 : PartnersVesting
 *   nonce 9 : WINTGTreasury (multisig)
 *   nonce 10: BurnContract
 *   nonce 11: FeeDistributor
 *   nonce 12: WTGToken (wrapper)
 *
 * NE PAS MODIFIER cet ordre sans régénérer le genesis.
 *
 * Usage :
 *   npm run deploy:testnet
 *   npm run deploy:mainnet
 *   npx hardhat run scripts/deploy.ts --network wintgTestnet -- --dry-run
 */

import { ethers, network, run } from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface DeploymentRecord {
  network: string;
  chainId: bigint;
  deployer: string;
  timestamp: string;
  contracts: Record<string, { address: string; constructorArgs: unknown[]; nonce: number }>;
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;
  const startNonce = await provider.getTransactionCount(deployer.address);

  console.log(`\n🌍 Réseau : ${network.name} (chainId ${chainId})`);
  console.log(`👤 Deployer : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(await provider.getBalance(deployer.address))} WTG`);
  console.log(`🔢 Nonce de départ : ${startNonce}`);
  if (DRY_RUN) console.log(`🧪 MODE DRY-RUN — aucune transaction envoyée`);
  console.log("");

  if (startNonce !== 0) {
    console.warn(
      `⚠️  Le déployeur a déjà émis ${startNonce} transactions. Les adresses CREATE pré-allouées dans le genesis ne correspondront pas !`,
    );
    if (!DRY_RUN) {
      console.error("Abort. Utiliser un wallet déployeur frais (nonce = 0).");
      process.exit(1);
    }
  }

  // -----------------------------------------------------------------------
  // Paramètres
  // -----------------------------------------------------------------------
  const env = (k: string, fallback?: string): string => {
    const v = process.env[k] ?? fallback;
    if (v === undefined) {
      console.error(`Variable d'environnement manquante : ${k}`);
      process.exit(1);
    }
    return v;
  };

  const treasurySigners = env("TREASURY_SIGNERS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (treasurySigners.length < 3) {
    console.error(`TREASURY_SIGNERS doit contenir au moins 3 adresses (CSV)`);
    process.exit(1);
  }
  const treasuryThreshold = parseInt(env("TREASURY_THRESHOLD", "2"), 10);

  const teamBeneficiary = env("TEAM_BENEFICIARY", deployer.address);
  const advisorsBeneficiary = env("ADVISORS_BENEFICIARY", deployer.address);
  const ecosystemBeneficiary = env("ECOSYSTEM_BENEFICIARY", deployer.address);
  const partnersBeneficiary = env("PARTNERS_BENEFICIARY", deployer.address);
  const validatorPool = env("VALIDATOR_POOL_ADDRESS", deployer.address);
  const airdropMerkleRoot = env(
    "AIRDROP_MERKLE_ROOT",
    "0x" + "00".repeat(31) + "01",
  );

  const tge = parseInt(env("TGE_TIMESTAMP", String(Math.floor(Date.now() / 1000))), 10);

  // -----------------------------------------------------------------------
  // Allocations (en wei)
  // -----------------------------------------------------------------------
  const ALLOC = {
    publicSale:    120_000_000n * 10n ** 18n,
    privateSale:    80_000_000n * 10n ** 18n,
    team:          150_000_000n * 10n ** 18n,
    advisors:       30_000_000n * 10n ** 18n,
    ecosystem:     200_000_000n * 10n ** 18n,
    airdrop:        80_000_000n * 10n ** 18n,
    staking:       150_000_000n * 10n ** 18n,
    treasury:      100_000_000n * 10n ** 18n,
    partners:       20_000_000n * 10n ** 18n,
  };

  // -----------------------------------------------------------------------
  // Factories
  // -----------------------------------------------------------------------
  const fac = (name: string) => ethers.getContractFactory(name);

  const F = {
    PublicSaleVesting:     await fac("PublicSaleVesting"),
    PrivateSaleVesting:    await fac("PrivateSaleVesting"),
    TeamVesting:           await fac("TeamVesting"),
    AdvisorsVesting:       await fac("AdvisorsVesting"),
    EcosystemVesting:      await fac("EcosystemVesting"),
    AirdropVesting:        await fac("AirdropVesting"),
    StakingRewardsReserve: await fac("StakingRewardsReserve"),
    TreasuryVesting:       await fac("TreasuryVesting"),
    PartnersVesting:       await fac("PartnersVesting"),
    WINTGTreasury:         await fac("WINTGTreasury"),
    BurnContract:          await fac("BurnContract"),
    FeeDistributor:        await fac("FeeDistributor"),
    WTGToken:              await fac("WTGToken"),
  } as const;

  // -----------------------------------------------------------------------
  // Adresses pré-calculées (CREATE)
  // -----------------------------------------------------------------------
  const expected: Record<string, string> = {};
  const ORDER = [
    "PublicSaleVesting",
    "PrivateSaleVesting",
    "TeamVesting",
    "AdvisorsVesting",
    "EcosystemVesting",
    "AirdropVesting",
    "StakingRewardsReserve",
    "TreasuryVesting",
    "PartnersVesting",
    "WINTGTreasury",
    "BurnContract",
    "FeeDistributor",
    "WTGToken",
  ];
  ORDER.forEach((name, i) => {
    expected[name] = ethers.getCreateAddress({ from: deployer.address, nonce: startNonce + i });
  });

  console.log("📋 Adresses CREATE attendues :");
  for (const [n, a] of Object.entries(expected)) console.log(`   ${n.padEnd(22)} ${a}`);
  console.log("");

  if (DRY_RUN) {
    console.log("✓ Dry-run terminé. Aucune transaction envoyée.");
    return;
  }

  // -----------------------------------------------------------------------
  // Déploiements (ordre strict)
  // -----------------------------------------------------------------------
  const deployments: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {},
  };

  const record = (name: string, address: string, args: unknown[], nonce: number) => {
    deployments.contracts[name] = { address, constructorArgs: args, nonce };
    if (expected[name].toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        `Adresse ${name} ne correspond pas à la pré-allocation : attendu ${expected[name]}, obtenu ${address}`,
      );
    }
    console.log(`  ✓ ${name.padEnd(22)} ${address}  (nonce ${nonce})`);
  };

  // Step 1 — Vestings (single-beneficiary)
  console.log("⚙️  Étape 1/4 — Déploiement des vestings (9 contrats)...");

  const publicSale = await F.PublicSaleVesting.deploy(deployer.address, tge, ALLOC.publicSale);
  await publicSale.waitForDeployment();
  record("PublicSaleVesting", await publicSale.getAddress(), [deployer.address, tge, ALLOC.publicSale.toString()], startNonce);

  const privateSale = await F.PrivateSaleVesting.deploy(deployer.address, tge, ALLOC.privateSale);
  await privateSale.waitForDeployment();
  record("PrivateSaleVesting", await privateSale.getAddress(), [deployer.address, tge, ALLOC.privateSale.toString()], startNonce + 1);

  const team = await F.TeamVesting.deploy(deployer.address, teamBeneficiary, tge, ALLOC.team);
  await team.waitForDeployment();
  record("TeamVesting", await team.getAddress(), [deployer.address, teamBeneficiary, tge, ALLOC.team.toString()], startNonce + 2);

  const advisors = await F.AdvisorsVesting.deploy(deployer.address, advisorsBeneficiary, tge, ALLOC.advisors);
  await advisors.waitForDeployment();
  record("AdvisorsVesting", await advisors.getAddress(), [deployer.address, advisorsBeneficiary, tge, ALLOC.advisors.toString()], startNonce + 3);

  const ecosystem = await F.EcosystemVesting.deploy(deployer.address, ecosystemBeneficiary, tge, ALLOC.ecosystem);
  await ecosystem.waitForDeployment();
  record("EcosystemVesting", await ecosystem.getAddress(), [deployer.address, ecosystemBeneficiary, tge, ALLOC.ecosystem.toString()], startNonce + 4);

  const airdrop = await F.AirdropVesting.deploy(deployer.address, airdropMerkleRoot, tge, ALLOC.airdrop);
  await airdrop.waitForDeployment();
  record("AirdropVesting", await airdrop.getAddress(), [deployer.address, airdropMerkleRoot, tge, ALLOC.airdrop.toString()], startNonce + 5);

  const staking = await F.StakingRewardsReserve.deploy(deployer.address, ALLOC.staking);
  await staking.waitForDeployment();
  record("StakingRewardsReserve", await staking.getAddress(), [deployer.address, ALLOC.staking.toString()], startNonce + 6);

  // TreasuryVesting bénéficiaire = adresse anticipée du WINTGTreasury (nonce + 9)
  const treasuryAddr = expected.WINTGTreasury;
  const treasuryV = await F.TreasuryVesting.deploy(deployer.address, treasuryAddr, tge, ALLOC.treasury);
  await treasuryV.waitForDeployment();
  record("TreasuryVesting", await treasuryV.getAddress(), [deployer.address, treasuryAddr, tge, ALLOC.treasury.toString()], startNonce + 7);

  const partners = await F.PartnersVesting.deploy(deployer.address, partnersBeneficiary, tge, ALLOC.partners);
  await partners.waitForDeployment();
  record("PartnersVesting", await partners.getAddress(), [deployer.address, partnersBeneficiary, tge, ALLOC.partners.toString()], startNonce + 8);

  // Step 2 — Treasury multisig
  console.log("⚙️  Étape 2/4 — Multisig Treasury...");
  const treasuryMs = await F.WINTGTreasury.deploy(treasurySigners, treasuryThreshold);
  await treasuryMs.waitForDeployment();
  record("WINTGTreasury", await treasuryMs.getAddress(), [treasurySigners, treasuryThreshold], startNonce + 9);

  // Step 3 — Burn + FeeDistributor
  console.log("⚙️  Étape 3/4 — Burn + FeeDistributor...");
  const burn = await F.BurnContract.deploy();
  await burn.waitForDeployment();
  record("BurnContract", await burn.getAddress(), [], startNonce + 10);

  // FeeDistributor splits transaction fees 40/50/5/5
  // (Treasury / Validator pool / Burn / Community pool).
  // Community pool defaults to Treasury until a dedicated pool contract
  // is deployed in a later step.
  const communityPool = await treasuryMs.getAddress();
  const distrib = await F.FeeDistributor.deploy(
    await treasuryMs.getAddress(),  // owner
    await treasuryMs.getAddress(),  // treasury
    validatorPool,
    await burn.getAddress(),
    communityPool,
  );
  await distrib.waitForDeployment();
  record(
    "FeeDistributor",
    await distrib.getAddress(),
    [
      await treasuryMs.getAddress(),
      await treasuryMs.getAddress(),
      validatorPool,
      await burn.getAddress(),
      communityPool,
    ],
    startNonce + 11,
  );

  // Step 4 — WTGToken (wrapper)
  console.log("⚙️  Étape 4/4 — WTGToken (WWTG wrapper)...");
  const wtg = await F.WTGToken.deploy();
  await wtg.waitForDeployment();
  record("WTGToken", await wtg.getAddress(), [], startNonce + 12);

  // -----------------------------------------------------------------------
  // Sauvegarde
  // -----------------------------------------------------------------------
  const outDir = resolve(__dirname, "..", "deployments");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${network.name}.json`);
  writeFileSync(outPath, JSON.stringify(serializeDeployments(deployments), null, 2) + "\n");
  console.log(`\n💾 Adresses sauvegardées : ${outPath}`);

  // Markdown summary
  writeFileSync(
    resolve(outDir, `${network.name}.md`),
    formatMarkdown(deployments),
  );
  console.log(`📄 Rapport markdown : ${outDir}/${network.name}.md`);

  // -----------------------------------------------------------------------
  // Vérification Blockscout (best-effort)
  // -----------------------------------------------------------------------
  if (process.env.BLOCKSCOUT_API_URL && !process.env.SKIP_VERIFY) {
    console.log("\n🔍 Vérification des sources sur Blockscout...");
    for (const [name, info] of Object.entries(deployments.contracts)) {
      try {
        await run("verify:verify", {
          address: info.address,
          constructorArguments: info.constructorArgs,
        });
        console.log(`  ✓ ${name} vérifié`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Already Verified")) {
          console.log(`  ⊘ ${name} déjà vérifié`);
        } else {
          console.warn(`  ⚠ ${name} : ${msg.split("\n")[0]}`);
        }
      }
    }
  }

  console.log("\n✅ Déploiement terminé.\n");
}

function serializeDeployments(d: DeploymentRecord): unknown {
  return {
    ...d,
    chainId: d.chainId.toString(),
    contracts: Object.fromEntries(
      Object.entries(d.contracts).map(([k, v]) => [
        k,
        {
          ...v,
          constructorArgs: v.constructorArgs.map((a) =>
            typeof a === "bigint" ? a.toString() : a,
          ),
        },
      ]),
    ),
  };
}

function formatMarkdown(d: DeploymentRecord): string {
  let md = `# Déploiement WINTG — ${d.network}\n\n`;
  md += `- **Chain ID** : \`${d.chainId}\`\n`;
  md += `- **Deployer** : \`${d.deployer}\`\n`;
  md += `- **Timestamp** : ${d.timestamp}\n\n`;
  md += `## Contrats\n\n| # | Nom | Adresse |\n|---|---|---|\n`;
  for (const [name, info] of Object.entries(d.contracts)) {
    md += `| ${info.nonce} | \`${name}\` | \`${info.address}\` |\n`;
  }
  return md;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
