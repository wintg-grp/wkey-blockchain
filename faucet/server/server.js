/* eslint-disable no-console */
/**
 * WINTG Faucet — backend server
 * --------------------------------
 *
 * 2 endpoints :
 *   GET  /api/captcha       → returns { id, question, expiresAt }
 *   POST /api/claim         → body { captchaId, answer, address, token, walletSig, walletTs }
 *
 * Captcha : math simple (a OP b) avec 4 choix, 30s d'expiration.
 * Auth web3 : signature wallet du message "wintg-faucet:<unix-ts>" (anti-bot).
 *
 * Une fois validé : le serveur signe une attestation ECDSA pour le contract
 * WintgFaucet, qui distribue les tokens on-chain via signed claim.
 *
 * Limits :
 *   - 1 claim per address per token per cooldown (24h, défini on-chain)
 *   - Captcha use-once (delete after consumption)
 *   - Rate limit IP : 10 captchas / 5 min
 *
 * Configuration .env :
 *   FAUCET_PORT                  (default 3001)
 *   FAUCET_RPC_TESTNET           https://testnet-rpc.wintg.network
 *   FAUCET_CONTRACT_TESTNET      0x1a93C2f164774A3dB38b50a46dE5936E01702402
 *   FAUCET_SIGNER_PRIVATE_KEY    hex 0x… (verifAdmin from batch1 keystore)
 *   FAUCET_TOKENS_TESTNET        comma-separated list: native,wwtg=0x...,wkey=0x...,...
 */

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { Wallet, JsonRpcProvider, getAddress, verifyMessage } from "ethers";

const PORT = parseInt(process.env.FAUCET_PORT || "3001", 10);
const RPC = process.env.FAUCET_RPC_TESTNET || "https://testnet-rpc.wintg.network";
const FAUCET_ADDR = process.env.FAUCET_CONTRACT_TESTNET || "0x1a93C2f164774A3dB38b50a46dE5936E01702402";
const SIGNER_KEY = process.env.FAUCET_SIGNER_PRIVATE_KEY;
const CHAIN_ID = parseInt(process.env.FAUCET_CHAIN_ID || "22800", 10);

if (!SIGNER_KEY) { console.error("FAUCET_SIGNER_PRIVATE_KEY env var missing"); process.exit(1); }

// Token catalogue (testnet only — mainnet fauceting is a security risk)
const TOKEN_CATALOG = {
  native: {
    label:  "WTG (gas)",
    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    amount:  "100000000000000000000",     // 100 WTG
  },
  wwtg: {
    label:  "WWTG",
    address: "0x595CaeD7E38d34cFc4013af5bF86B0D38E115351",
    amount:  "100000000000000000000",     // 100 WWTG
  },
  wkey: {
    label:  "WKEY",
    address: "0xEf6df253dF3A24160233564efDdcFa8EB99Ea337",
    amount:  "1000000000000000000000",    // 1000 WKEY
  },
  usdw: {
    label:  "USDW",
    address: "0x401cA097F6105384A3cd327bA86AE950E9A84Ef8",
    amount:  "10000000000000000000",      // 10 USDW
  },
  wcfa: {
    label:  "WCFA",
    address: "0x23100037E793357c5105aC82A75fe5aC39f22BE3",
    amount:  "5000000000000000000000",    // 5000 WCFA
  },
};

const provider = new JsonRpcProvider(RPC);
const signer = new Wallet(SIGNER_KEY, provider);
console.log(`Faucet signer: ${signer.address}`);

// ---------------------------------------------------------------------------
// Captcha store (in-memory)
// ---------------------------------------------------------------------------

const captchas = new Map(); // id => { question, answer, expiresAt }
const CAPTCHA_TTL_MS = 60_000;

function makeCaptcha() {
  const a = Math.floor(Math.random() * 12) + 1;
  const b = Math.floor(Math.random() * 12) + 1;
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let answer;
  switch (op) {
    case "+": answer = a + b; break;
    case "-": answer = a - b; break;
    case "×": answer = a * b; break;
  }
  // 4 choices: 1 right + 3 wrong
  const choices = new Set([answer]);
  while (choices.size < 4) {
    choices.add(answer + Math.floor((Math.random() - 0.5) * 8));
  }
  const id = crypto.randomBytes(8).toString("hex");
  captchas.set(id, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return {
    id,
    question: `${a} ${op} ${b}`,
    choices: Array.from(choices).sort(() => Math.random() - 0.5),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  };
}

// Cleanup expired captchas
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of captchas) {
    if (c.expiresAt < now) captchas.delete(id);
  }
}, 30_000);

// ---------------------------------------------------------------------------
// Rate limiting per IP
// ---------------------------------------------------------------------------

const ipBucket = new Map(); // ip => [timestamps]
const RATE_WINDOW = 5 * 60_000;
const RATE_MAX = 10;

function rateLimit(ip) {
  const now = Date.now();
  const arr = (ipBucket.get(ip) || []).filter(t => t > now - RATE_WINDOW);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  ipBucket.set(ip, arr);
  return true;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, signer: signer.address, chainId: CHAIN_ID }));

app.get("/api/tokens", (_req, res) => res.json({ tokens: TOKEN_CATALOG }));

app.get("/api/captcha", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!rateLimit(ip)) return res.status(429).json({ error: "rate-limited" });
  res.json(makeCaptcha());
});

app.post("/api/claim", async (req, res) => {
  try {
    const { captchaId, answer, address, tokenKey, walletSig, walletTs } = req.body;

    // 1. Captcha valid?
    const c = captchas.get(captchaId);
    if (!c) return res.status(400).json({ error: "invalid-captcha" });
    if (c.expiresAt < Date.now()) {
      captchas.delete(captchaId);
      return res.status(400).json({ error: "captcha-expired" });
    }
    if (Number(answer) !== c.answer) {
      captchas.delete(captchaId);
      return res.status(400).json({ error: "wrong-answer" });
    }
    captchas.delete(captchaId); // single use

    // 2. Token valid?
    const tok = TOKEN_CATALOG[tokenKey];
    if (!tok) return res.status(400).json({ error: "unknown-token" });

    // 3. Wallet signature valid?
    if (!walletSig || !walletTs) return res.status(400).json({ error: "missing-wallet-sig" });
    const ts = parseInt(walletTs, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return res.status(400).json({ error: "wallet-ts-out-of-window" });
    const recovered = verifyMessage(`wintg-faucet:${ts}`, walletSig);
    if (getAddress(recovered) !== getAddress(address)) return res.status(400).json({ error: "wallet-sig-mismatch" });

    // 4. Sign attestation for the on-chain faucet
    const nonce = "0x" + crypto.randomBytes(32).toString("hex");
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const messageHash = ethersKeccak256OfPackedAbiEncode(
      ["string", "uint256", "address", "address", "address", "uint256", "bytes32", "uint64"],
      ["WINTG-FAUCET", BigInt(CHAIN_ID), FAUCET_ADDR, getAddress(address), tok.address, BigInt(tok.amount), nonce, BigInt(deadline)]
    );
    const sig = await signer.signMessage(getBytes32(messageHash));

    res.json({
      faucetContract: FAUCET_ADDR,
      token: tok.address,
      amount: tok.amount,
      nonce,
      deadline,
      signature: sig,
      label: tok.label,
    });
  } catch (e) {
    console.error("claim error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Helpers
import { AbiCoder, keccak256, getBytes } from "ethers";
function ethersKeccak256OfPackedAbiEncode(types, values) {
  const encoded = AbiCoder.defaultAbiCoder().encode(types, values);
  return keccak256(encoded);
}
function getBytes32(hashHex) { return getBytes(hashHex); }

app.listen(PORT, () => {
  console.log(`WINTG Faucet API listening on ${PORT}, faucet contract ${FAUCET_ADDR} on chain ${CHAIN_ID}`);
});
