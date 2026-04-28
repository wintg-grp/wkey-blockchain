/* eslint-disable no-console */
/**
 * deploy-batch1.ts — Déploiement de la Phase 1.5 (Batch 1).
 *
 * Contrats déployés (5) :
 *   1. WintgChainMetadata     — registry du logo de la chaîne et de WTG natif
 *   2. VerificationRegistry   — gestion centralisée des badges or
 *   3. ERC20FactoryV2         — factory tokens avec frais 100 WTG
 *   4. WintgMultiSender       — utility public airdrop
 *   5. (SimpleERC20V2 est déployé à la demande par la factory, pas ici)
 *
 * Utilise les contrats Phase 1 existants :
 *   - WINTGTreasury (multisig) → owner de tout
 *   - Adresses connues lues depuis deployments/<network>.json
 *
 * Génère 2 nouveaux wallets :
 *   - VerificationAdmin — peut promouvoir tier 2 et révoquer
 *   - ChainAdmin        — peut modifier les logos / branding de la chaîne
 *
 * Les clés privées sont chiffrées et stockées dans wallets.encrypted.json.
 *
 * Usage :
 *   npx hardhat run scripts/deploy-batch1.ts --network wintgTestnet
 *   npx hardhat run scripts/deploy-batch1.ts --network wintgMainnet
 *   npx hardhat run scripts/deploy-batch1.ts --network local --dry-run
 */

import { ethers, network } from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

interface ExistingDeployment {
  network: string;
  chainId: string;
  contracts: Record<string, { address: string }>;
}

interface Batch1Record {
  network: string;
  chainId: string;
  deployer: string;
  timestamp: string;
  contracts: Record<string, { address: string; constructorArgs: unknown[] }>;
  generatedAccounts: {
    verificationAdmin: { address: string; encryptedKeystore: string };
    chainAdmin: { address: string; encryptedKeystore: string };
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;
  const balance = await provider.getBalance(deployer.address);

  console.log(`\n🌍 Réseau : ${network.name} (chainId ${chainId})`);
  console.log(`👤 Deployer : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(balance)} WTG`);
  if (DRY_RUN) console.log(`🧪 MODE DRY-RUN`);
  console.log("");

  // -----------------------------------------------------------------------
  // Lecture du déploiement Phase 1 existant
  // -----------------------------------------------------------------------
  const networkKey = network.name; // wintgMainnet, wintgTestnet, local
  const existingPath = resolve(__dirname, `../deployments/${networkKey}.json`);
  const existingLocalPath = resolve(__dirname, `../deployments/${networkKey}-local.json`);

  let existing: ExistingDeployment | null = null;
  for (const p of [existingPath, existingLocalPath]) {
    if (existsSync(p)) {
      existing = JSON.parse(readFileSync(p, "utf-8")) as ExistingDeployment;
      console.log(`📦 Phase 1 existante chargée : ${p}`);
      break;
    }
  }
  if (!existing) {
    console.warn(`⚠️  Aucun déploiement Phase 1 trouvé pour ${networkKey}. Mode standalone.`);
  }

  // Treasury : on prend du Phase 1 sinon le deployer (mode local).
  const treasuryAddr = existing?.contracts?.WINTGTreasury?.address ?? deployer.address;
  console.log(`🏦 Treasury (owner / multisig) : ${treasuryAddr}`);

  // -----------------------------------------------------------------------
  // Génération des wallets admin (VerificationAdmin + ChainAdmin)
  // -----------------------------------------------------------------------
  const passphrase = process.env.ADMIN_KEYSTORE_PASSPHRASE ?? "wintg-batch1-default-passphrase";
  if (passphrase === "wintg-batch1-default-passphrase" && !DRY_RUN) {
    console.warn(
      `⚠️  ADMIN_KEYSTORE_PASSPHRASE non défini — utilisation de la passphrase par défaut.\n` +
      `   Pour un déploiement production, settez la variable d'environnement.`,
    );
  }

  console.log(`\n🔐 Génération des wallets admin…`);
  const verificationAdmin = ethers.Wallet.createRandom();
  const chainAdmin = ethers.Wallet.createRandom();
  console.log(`   VerificationAdmin : ${verificationAdmin.address}`);
  console.log(`   ChainAdmin        : ${chainAdmin.address}`);

  const verificationKeystore = await verificationAdmin.encrypt(passphrase);
  const chainAdminKeystore = await chainAdmin.encrypt(passphrase);

  // -----------------------------------------------------------------------
  // 1) WintgChainMetadata
  // -----------------------------------------------------------------------
  console.log(`\n📦 1/4 — Déploiement WintgChainMetadata…`);
  const ChainMeta = await ethers.getContractFactory("WintgChainMetadata");
  const chainMetaArgs = [
    treasuryAddr,
    chainAdmin.address,
    "WINTG",
    "WINTG",
    "WINTG",
    "WTG",
  ] as const;

  let chainMetaAddr = "0x0000000000000000000000000000000000000000";
  if (!DRY_RUN) {
    const deployed = await ChainMeta.deploy(...chainMetaArgs);
    await deployed.waitForDeployment();
    chainMetaAddr = await deployed.getAddress();
    console.log(`   ✅ ${chainMetaAddr}`);
  } else {
    console.log(`   (dry-run) skipped`);
  }

  // -----------------------------------------------------------------------
  // 2) VerificationRegistry
  // -----------------------------------------------------------------------
  console.log(`\n📦 2/4 — Déploiement VerificationRegistry…`);
  const Reg = await ethers.getContractFactory("VerificationRegistry");
  const regArgs = [treasuryAddr, verificationAdmin.address, treasuryAddr] as const;

  let regAddr = "0x0000000000000000000000000000000000000000";
  if (!DRY_RUN) {
    const deployed = await Reg.deploy(...regArgs);
    await deployed.waitForDeployment();
    regAddr = await deployed.getAddress();
    console.log(`   ✅ ${regAddr}`);
  } else {
    console.log(`   (dry-run) skipped`);
  }

  // -----------------------------------------------------------------------
  // 3) ERC20FactoryV2
  // -----------------------------------------------------------------------
  console.log(`\n📦 3/4 — Déploiement ERC20FactoryV2…`);
  const Fact = await ethers.getContractFactory("ERC20FactoryV2");
  const factArgs = [treasuryAddr, treasuryAddr, regAddr] as const;

  let factAddr = "0x0000000000000000000000000000000000000000";
  if (!DRY_RUN) {
    const deployed = await Fact.deploy(...factArgs);
    await deployed.waitForDeployment();
    factAddr = await deployed.getAddress();
    console.log(`   ✅ ${factAddr}`);

    // Authorize the factory in the registry — but the registry is owned by
    // the multisig, so we cannot call setFactoryAuthorized from the deployer
    // unless deployer == owner. Sur testnet/local le deployer est souvent
    // owner ; sur mainnet il faudra que le multisig appelle ça après.
    const reg = await ethers.getContractAt("VerificationRegistry", regAddr);
    const regOwner = await reg.owner();
    if (regOwner.toLowerCase() === deployer.address.toLowerCase()) {
      console.log(`   🔧 Auto-authorize factory in registry…`);
      const tx = await reg.setFactoryAuthorized(factAddr, true);
      await tx.wait();
      console.log(`   ✅ Factory authorized`);
    } else {
      console.log(`   ⚠️  Registry owner (${regOwner}) is not the deployer.`);
      console.log(`      Le multisig doit appeler manuellement :`);
      console.log(`      registry.setFactoryAuthorized(${factAddr}, true)`);
    }
  } else {
    console.log(`   (dry-run) skipped`);
  }

  // -----------------------------------------------------------------------
  // 4) WintgMultiSender
  // -----------------------------------------------------------------------
  console.log(`\n📦 4/4 — Déploiement WintgMultiSender…`);
  const MS = await ethers.getContractFactory("WintgMultiSender");
  let msAddr = "0x0000000000000000000000000000000000000000";
  if (!DRY_RUN) {
    const deployed = await MS.deploy();
    await deployed.waitForDeployment();
    msAddr = await deployed.getAddress();
    console.log(`   ✅ ${msAddr}`);
  } else {
    console.log(`   (dry-run) skipped`);
  }

  // -----------------------------------------------------------------------
  // Save deployment manifest
  // -----------------------------------------------------------------------
  const record: Batch1Record = {
    network: networkKey,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WintgChainMetadata: { address: chainMetaAddr, constructorArgs: [...chainMetaArgs] },
      VerificationRegistry: { address: regAddr, constructorArgs: [...regArgs] },
      ERC20FactoryV2: { address: factAddr, constructorArgs: [...factArgs] },
      WintgMultiSender: { address: msAddr, constructorArgs: [] },
    },
    generatedAccounts: {
      verificationAdmin: {
        address: verificationAdmin.address,
        encryptedKeystore: verificationKeystore,
      },
      chainAdmin: {
        address: chainAdmin.address,
        encryptedKeystore: chainAdminKeystore,
      },
    },
  };

  const outDir = resolve(__dirname, "../deployments");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${networkKey}-batch1.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");

  console.log(`\n📝 Manifest sauvegardé : ${outPath}`);
  console.log(`\n🎯 Récap :`);
  for (const [name, c] of Object.entries(record.contracts)) {
    console.log(`   ${name.padEnd(22)} ${c.address}`);
  }
  console.log(`\n🔑 Wallets générés (clés chiffrées dans le manifest) :`);
  console.log(`   VerificationAdmin : ${verificationAdmin.address}`);
  console.log(`   ChainAdmin        : ${chainAdmin.address}`);

  if (!DRY_RUN) {
    console.log(`\n⚙️  Actions multisig requises ensuite :`);
    console.log(`   1. registry.setFactoryAuthorized(${factAddr}, true)  [si pas auto]`);
    console.log(`   2. (Plus tard, après upload IPFS des logos)`);
    console.log(`      chainMeta.setBranding(chainLogoURI, nativeTokenLogoURI, ...)`);
  }
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
