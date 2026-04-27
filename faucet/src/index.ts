/**
 * WINTG Testnet Faucet
 *
 * Distribue 100 WTG par adresse / 24 h aux développeurs souhaitant tester
 * sur le testnet WINTG (chainId 22800).
 *
 * Sécurité :
 *   - hCaptcha (anti-bot)
 *   - Rate limit par IP (10 req/h)
 *   - Cooldown par adresse (24 h)
 *   - Cooldown par IP (24 h)
 *   - Helmet (HTTP security headers)
 *   - CORS restrictif (faucet.wintg.network origin)
 *   - Wallet faucet pré-funded depuis Ecosystem multisig
 */

import express, { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import axios from "axios";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "3030", 10);
const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.wintg.network";
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY ?? "";
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET ?? "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://faucet.wintg.network")
  .split(",").map((s) => s.trim());

const DRIP_AMOUNT_WTG = BigInt(process.env.DRIP_AMOUNT_WTG ?? "100");
const COOLDOWN_HOURS = parseInt(process.env.COOLDOWN_HOURS ?? "24", 10);
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

if (!FAUCET_PRIVATE_KEY) {
  console.error("FAUCET_PRIVATE_KEY non défini — refus de démarrer.");
  process.exit(1);
}

// ----------------------------------------------------------------------------
// Provider et wallet
// ----------------------------------------------------------------------------

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(FAUCET_PRIVATE_KEY, provider);

// ----------------------------------------------------------------------------
// Tracking en mémoire (production : Redis ou Postgres)
// ----------------------------------------------------------------------------

interface CooldownEntry { timestamp: number; }
const addressCooldowns = new Map<string, CooldownEntry>();
const ipCooldowns = new Map<string, CooldownEntry>();
const totalDripped = { wtg: 0n, count: 0 };

function cleanupCooldowns() {
  const now = Date.now();
  for (const [k, v] of addressCooldowns.entries()) {
    if (now - v.timestamp > COOLDOWN_MS) addressCooldowns.delete(k);
  }
  for (const [k, v] of ipCooldowns.entries()) {
    if (now - v.timestamp > COOLDOWN_MS) ipCooldowns.delete(k);
  }
}
setInterval(cleanupCooldowns, 60_000);

// ----------------------------------------------------------------------------
// hCaptcha verification
// ----------------------------------------------------------------------------

async function verifyHcaptcha(token: string, ip: string): Promise<boolean> {
  if (!HCAPTCHA_SECRET) {
    console.warn("⚠ HCAPTCHA_SECRET non défini — captcha bypassed (dev only)");
    return true;
  }
  try {
    const res = await axios.post(
      "https://hcaptcha.com/siteverify",
      new URLSearchParams({
        secret: HCAPTCHA_SECRET,
        response: token,
        remoteip: ip,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      },
    );
    return Boolean(res.data?.success);
  } catch (err) {
    console.error("hCaptcha verify error:", err);
    return false;
  }
}

// ----------------------------------------------------------------------------
// Express app
// ----------------------------------------------------------------------------

const app = express();
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["POST", "GET"] }));
app.use(express.json({ limit: "10kb" }));
app.set("trust proxy", 1);  // Cloudflare / Nginx upstream

const dripLimit = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 h
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, retry in 1 hour" },
});

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

app.get("/api/health", async (_req, res) => {
  try {
    const blockNumber = await provider.getBlockNumber();
    const balance = await provider.getBalance(wallet.address);
    res.json({
      ok: true,
      faucet: wallet.address,
      balanceWTG: Number(ethers.formatEther(balance)),
      blockNumber,
      totalDripped: { wtg: totalDripped.wtg.toString(), count: totalDripped.count },
      cooldowns: { addresses: addressCooldowns.size, ips: ipCooldowns.size },
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

app.post("/api/drip", dripLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address, captcha } = req.body ?? {};
    const ip = req.ip ?? "unknown";

    // Validation
    if (typeof address !== "string" || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    if (typeof captcha !== "string" || captcha.length === 0) {
      return res.status(400).json({ error: "Captcha required" });
    }

    const checksumAddr = ethers.getAddress(address);

    // Cooldown adresse
    const addrCd = addressCooldowns.get(checksumAddr.toLowerCase());
    if (addrCd && Date.now() - addrCd.timestamp < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - addrCd.timestamp)) / 60_000);
      return res.status(429).json({ error: `Address on cooldown. Retry in ${wait} min` });
    }

    // Cooldown IP
    const ipCd = ipCooldowns.get(ip);
    if (ipCd && Date.now() - ipCd.timestamp < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - ipCd.timestamp)) / 60_000);
      return res.status(429).json({ error: `IP on cooldown. Retry in ${wait} min` });
    }

    // Captcha
    const captchaOk = await verifyHcaptcha(captcha, ip);
    if (!captchaOk) return res.status(403).json({ error: "Captcha invalid" });

    // Send tx
    const value = DRIP_AMOUNT_WTG * 10n ** 18n;
    const balance = await provider.getBalance(wallet.address);
    if (balance < value + ethers.parseEther("0.01")) {
      return res.status(503).json({ error: "Faucet drained, please contact admin" });
    }

    const tx = await wallet.sendTransaction({ to: checksumAddr, value });
    console.log(`[drip] ${ip} → ${checksumAddr} : ${DRIP_AMOUNT_WTG} WTG (tx ${tx.hash})`);

    // Enregistrer cooldowns
    addressCooldowns.set(checksumAddr.toLowerCase(), { timestamp: Date.now() });
    ipCooldowns.set(ip, { timestamp: Date.now() });
    totalDripped.wtg += value;
    totalDripped.count += 1;

    res.json({
      ok: true,
      txHash: tx.hash,
      amountWTG: DRIP_AMOUNT_WTG.toString(),
      explorer: `https://scan.wintg.network/tx/${tx.hash}`,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Error handler
// ----------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ----------------------------------------------------------------------------
// Start
// ----------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚰 WINTG Faucet listening on :${PORT}`);
  console.log(`   Faucet wallet : ${wallet.address}`);
  console.log(`   RPC          : ${RPC_URL}`);
  console.log(`   Drip         : ${DRIP_AMOUNT_WTG} WTG / ${COOLDOWN_HOURS}h`);
});
