/* eslint-disable no-console */
/**
 * decrypt-faucet-signer.ts — décrypte la clé du verifAdmin testnet
 * (= signer du WintgFaucet) pour la déployer sur le serveur.
 */

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const passphrase = process.env.ADMIN_KEYSTORE_PASSPHRASE ?? "wintg-batch1-default-passphrase";
  const path = resolve(__dirname, `../deployments/wintgTestnet-batch1.json`);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  const enc = json.generatedAccounts.verificationAdmin.encryptedKeystore;
  const w = await ethers.Wallet.fromEncryptedJson(enc, passphrase);
  console.log(`Address    : ${w.address}`);
  console.log(`Private key: ${(w as ethers.Wallet).privateKey}`);
}
main().catch(e => { console.error(e); process.exit(1); });
