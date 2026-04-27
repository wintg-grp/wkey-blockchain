#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * generate-wallets.ts — Génère un set de wallets initiaux pour le bootstrap
 * du projet WINTG (deployer, validateur, signataires Treasury, hot standby).
 *
 * ⚠️  Les clés sont générées en mémoire ET imprimées dans un fichier chiffré
 * AES-256-GCM. La passphrase est demandée interactivement (jamais stockée).
 *
 * Usage :
 *   npx ts-node scripts/generate-wallets.ts > /dev/null
 *   (interactif : demande la passphrase, écrit `wallets.encrypted.json`)
 */

import { Wallet } from "ethers";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import * as readline from "node:readline";

const SCRYPT_N = 2 ** 17; // sécurité OK pour passphrase utilisateur
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const NONCE_LEN = 12;
const SALT_LEN = 16;

interface NamedWallet {
  role: string;
  address: string;
  privateKey: string;
  mnemonic?: string;
}

const ROLES = [
  "deployer",
  "validator-primary",
  "validator-standby",
  "treasury-signer-1",
  "treasury-signer-2",
  "treasury-signer-3",
  "treasury-signer-4",
  "treasury-signer-5",
  "team-beneficiary",
  "advisors-beneficiary",
  "ecosystem-beneficiary",
  "partners-beneficiary",
  "validator-pool",
];

function generate(): NamedWallet[] {
  return ROLES.map((role) => {
    const w = Wallet.createRandom();
    return {
      role,
      address: w.address,
      privateKey: w.privateKey,
      mnemonic: w.mnemonic?.phrase,
    };
  });
}

function askPassphrase(prompt: string): Promise<string> {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      res(answer);
    });
  });
}

function encrypt(plaintext: string, passphrase: string): {
  ciphertext: string; salt: string; nonce: string; tag: string;
} {
  const salt = randomBytes(SALT_LEN);
  // scrypt with N=2^17, r=8, p=1 needs 128 * r * N = 128 MB. Node's default
  // maxmem is 32 MB, so we have to bump it explicitly.
  const key = scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString("base64"),
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
  };
}

async function main() {
  const outPath = resolve(__dirname, "..", "wallets.encrypted.json");
  if (existsSync(outPath)) {
    console.error(`✖ ${outPath} existe déjà. Refus d'écraser. Renommer ou supprimer manuellement.`);
    process.exit(1);
  }

  console.log(`\n🔐 Génération de ${ROLES.length} wallets WINTG...\n`);

  const passphrase = await askPassphrase("Passphrase (≥ 16 caractères) : ");
  if (passphrase.length < 16) {
    console.error("✖ Passphrase trop courte (minimum 16 caractères).");
    process.exit(1);
  }
  const confirm = await askPassphrase("Confirmer la passphrase           : ");
  if (passphrase !== confirm) {
    console.error("✖ Les passphrases ne correspondent pas.");
    process.exit(1);
  }

  const wallets = generate();
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    algorithm: "aes-256-gcm + scrypt(N=2^17,r=8,p=1)",
    wallets,
  };

  const encrypted = encrypt(JSON.stringify(payload, null, 2), passphrase);

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        ...encrypted,
        notice: "Déchiffrer avec scrypt(passphrase, salt) + aes-256-gcm(key, nonce, tag).",
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n✅ Wallets chiffrés dans : ${outPath}`);
  console.log("📋 Adresses publiques :");
  for (const w of wallets) {
    console.log(`   ${w.role.padEnd(22)} ${w.address}`);
  }
  console.log(`\n⚠️  La passphrase n'est PAS stockée. Si tu la perds, les fonds sont perdus.`);
  console.log(`⚠️  Sauvegarder ${outPath} dans 3 emplacements géographiquement distincts.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
