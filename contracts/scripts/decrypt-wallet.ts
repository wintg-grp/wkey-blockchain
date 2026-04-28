#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * decrypt-wallet.ts — Decrypt a single wallet entry from wallets.encrypted.json
 *
 * Output is the bare 64-character hex private key (no 0x prefix), which is
 * the exact format Besu's --node-private-key-file expects.
 *
 * Usage:
 *   npx ts-node scripts/decrypt-wallet.ts <role>
 *
 * Example:
 *   npx ts-node scripts/decrypt-wallet.ts validator-primary
 *
 * The script asks for the same passphrase used during generate-wallets.ts.
 * The plaintext key is printed to stdout so you can paste it on the server.
 * Do not redirect to a file unless you intend to immediately move and chmod.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDecipheriv, scryptSync } from "node:crypto";
import * as readline from "node:readline";

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

interface EncryptedFile {
  ciphertext: string;
  salt: string;
  nonce: string;
  tag: string;
  notice?: string;
}

interface NamedWallet {
  role: string;
  address: string;
  privateKey: string;
  mnemonic?: string;
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

async function main() {
  const role = process.argv[2];
  if (!role) {
    console.error("Usage: npx ts-node scripts/decrypt-wallet.ts <role>");
    console.error("Example roles: deployer, validator-primary, validator-standby, treasury-signer-1, ...");
    process.exit(1);
  }

  const path = resolve(__dirname, "..", "wallets.encrypted.json");
  if (!existsSync(path)) {
    console.error(`✖ Encrypted file not found: ${path}`);
    process.exit(1);
  }

  const enc = JSON.parse(readFileSync(path, "utf8")) as EncryptedFile;
  const passphrase = await askPassphrase("Passphrase: ");

  const salt = Buffer.from(enc.salt, "base64");
  const nonce = Buffer.from(enc.nonce, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ct = Buffer.from(enc.ciphertext, "base64");

  const key = scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);

  let plaintext: string;
  try {
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    console.error("✖ Decryption failed. Wrong passphrase?");
    process.exit(1);
  }

  const payload = JSON.parse(plaintext) as { wallets: NamedWallet[] };
  const w = payload.wallets.find((x) => x.role === role);
  if (!w) {
    console.error(`✖ Role '${role}' not found. Available roles:`);
    for (const x of payload.wallets) console.error(`   ${x.role}`);
    process.exit(1);
  }

  // Strip 0x prefix — Besu's node-private-key-file wants raw hex
  const hex = w.privateKey.replace(/^0x/, "").toLowerCase();

  console.log("");
  console.log(`Role:     ${w.role}`);
  console.log(`Address:  ${w.address}`);
  console.log("");
  console.log("Private key (paste this into /etc/besu/<network>/keys/key on the server):");
  console.log(hex);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
