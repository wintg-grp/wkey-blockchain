/* eslint-disable no-console */
/**
 * multisig-helper.ts — utilitaires pour interagir avec le WINTGTreasury
 * (multisig 3-of-5).
 *
 * Décrypte les clés des `treasury-signer-N` à partir du fichier
 * `wallets.encrypted.json` (passphrase via env `WALLETS_PASSPHRASE` ou
 * stdin), puis fournit des helpers pour submit / confirm / execute.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDecipheriv, scryptSync } from "node:crypto";
import * as readline from "node:readline";
import { ethers } from "ethers";

interface EncryptedFile {
  ciphertext: string;
  salt: string;
  nonce: string;
  tag: string;
}

interface NamedWallet {
  role: string;
  address: string;
  privateKey: string;
}

interface WalletsPayload {
  wallets: NamedWallet[];
}

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function askPassphrase(): Promise<string> {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Wallets passphrase: ", (a) => { rl.close(); res(a); });
  });
}

export async function loadTreasurySigners(provider: ethers.Provider): Promise<ethers.Wallet[]> {
  const path = resolve(__dirname, "..", "wallets.encrypted.json");
  if (!existsSync(path)) throw new Error(`wallets.encrypted.json not found at ${path}`);
  const enc = JSON.parse(readFileSync(path, "utf-8")) as EncryptedFile;

  const passphrase = process.env.WALLETS_PASSPHRASE ?? (await askPassphrase());

  const salt = Buffer.from(enc.salt, "base64");
  const nonce = Buffer.from(enc.nonce, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ct = Buffer.from(enc.ciphertext, "base64");

  const key = scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  let plaintext: string;
  try {
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf-8");
  } catch {
    throw new Error("Wallets decryption failed — wrong passphrase?");
  }

  const payload = JSON.parse(plaintext) as WalletsPayload;
  const signers: ethers.Wallet[] = [];
  for (let i = 1; i <= 5; i++) {
    const w = payload.wallets.find((x) => x.role === `treasury-signer-${i}`);
    if (!w) throw new Error(`Role 'treasury-signer-${i}' missing in encrypted wallets`);
    signers.push(new ethers.Wallet(w.privateKey, provider));
  }
  return signers;
}

/**
 * Submit a tx to the multisig using `signer` (auto-confirms),
 * then confirm with `extraSigners` until threshold is reached,
 * finally execute. Returns the resulting tx hash of execute().
 */
export async function executeMultisigCall(opts: {
  treasury: ethers.Contract;     // typed treasury contract
  to: string;
  value: bigint;
  data: string;
  threshold: number;             // typically 3 for WINTG
  signers: ethers.Wallet[];      // at least `threshold`
  notBefore?: number;            // default 0
  description: string;
}) {
  const { treasury, to, value, data, threshold, signers, notBefore = 0, description } = opts;

  console.log(`\n📨 Submitting multisig tx — ${description}`);
  console.log(`   target: ${to}`);
  console.log(`   value:  ${ethers.formatEther(value)} WTG`);

  // Submit + auto-confirm via signer #0
  const txSubmit = await treasury.connect(signers[0]).submit(to, value, data, notBefore);
  const rcptSubmit = await txSubmit.wait();
  console.log(`   ✅ submit() block ${rcptSubmit.blockNumber} (signer ${signers[0].address})`);

  // Read the new txId from emitted event Submitted(uint256 txId, ...)
  const submittedLog = rcptSubmit.logs.find((l: any) => l.fragment?.name === "Submitted");
  if (!submittedLog) throw new Error("Submitted event not found");
  const txId: bigint = submittedLog.args[0];
  console.log(`   txId: ${txId}`);

  // Confirms until threshold (signer 0 already counted by auto-confirm)
  for (let i = 1; i < threshold; i++) {
    const tx = await treasury.connect(signers[i]).confirm(txId);
    await tx.wait();
    console.log(`   ✅ confirm() by signer ${signers[i].address}`);
  }

  // Execute
  const txExec = await treasury.connect(signers[0]).execute(txId);
  const rcptExec = await txExec.wait();
  console.log(`   ✅ execute() block ${rcptExec.blockNumber} — txHash ${rcptExec.hash}`);
  return { txId, hash: rcptExec.hash };
}
