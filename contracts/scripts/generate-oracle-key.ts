/* eslint-disable no-console */
/**
 * generate-oracle-key.ts — Génère une clé privée dédiée pour le worker
 * oracle WTG/CFA. Cette clé n'a comme privilège que de push le prix
 * (pas owner, pas multisig). Si elle fuite, le pire impact est un push
 * de prix incorrect (que le multisig peut révoquer).
 *
 * La clé est :
 *   - Affichée à l'écran (à copier sur le serveur en sécurisé)
 *   - Sauvegardée chiffrée dans wallets-oracle.encrypted.json (passphrase env)
 *
 * Usage :
 *   ORACLE_KEYSTORE_PASSPHRASE=... npx hardhat run scripts/generate-oracle-key.ts --network wintgMainnet
 */

import { ethers } from "hardhat";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const passphrase = process.env.ORACLE_KEYSTORE_PASSPHRASE
    ?? "WintgRot8-2026!Forge#Bootstrap"; // default if not set
  const outPath = resolve(__dirname, "../wallets-oracle.encrypted.json");

  let wallet: ethers.Wallet;
  if (existsSync(outPath)) {
    console.log(`✓ Oracle keystore déjà existant à ${outPath}`);
    const enc = readFileSync(outPath, "utf-8");
    wallet = (await ethers.Wallet.fromEncryptedJson(enc, passphrase)) as ethers.Wallet;
  } else {
    console.log(`🔐 Génération d'une nouvelle clé oracle…`);
    wallet = ethers.Wallet.createRandom();
    const enc = await wallet.encrypt(passphrase);
    writeFileSync(outPath, enc, "utf-8");
    console.log(`✓ keystore chiffré sauvegardé : ${outPath}`);
  }

  console.log(`\nOracle pusher address : ${wallet.address}`);
  console.log(`Private key (hex)     : ${wallet.privateKey}`);
  console.log(`\n⚠️  Garde cette clé EN SÛRETÉ. Elle sera installée sur le serveur (/opt/wintg-oracle/.env)`);
  console.log(`    Passphrase utilisée : ${passphrase === "WintgRot8-2026!Forge#Bootstrap" ? "(défaut)" : "(custom env)"}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
