/* eslint-disable no-console */
/**
 * WINTG sovereign IPFS pinning API.
 *
 * Pinata-compatible endpoints:
 *   POST /pinning/pinFileToIPFS         — multipart upload, returns { IpfsHash }
 *   GET  /pinning/pinList               — list pins by this server
 *   DELETE /pinning/unpin/:cid          — unpin
 *   GET  /health                        — liveness probe
 *
 * Authentication:
 *   - X-Wintg-Signature: hex signature of the message "wintg-pin:<unix-ts>"
 *   - X-Wintg-Address:   address that signed
 *   - X-Wintg-Timestamp: unix seconds (must be within 5 min of server clock)
 *
 *   The server verifies the signature with viem-style ECDSA recover and
 *   maps the address to a daily quota (default 100 MB / address).
 *
 * Storage:
 *   Talks to the Kubo HTTP API at IPFS_API_URL (default http://ipfs:5001).
 */

const express   = require("express");
const multer    = require("multer");
const FormData  = require("form-data");
const fetch     = require("node-fetch");
const { verifyMessage, getAddress } = require("ethers");

const PORT          = parseInt(process.env.PORT || "3000", 10);
const IPFS_API_URL  = process.env.IPFS_API_URL || "http://ipfs:5001";
const QUOTA_BYTES   = parseInt(process.env.PIN_QUOTA_BYTES_PER_DAY || "104857600", 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "20971520", 10); // 20MB per file

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

// In-memory daily quota map (resets at midnight UTC).
const quotaMap = new Map(); // address.toLowerCase() => { dayKey, used }

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function consumeQuota(addr, bytes) {
  const a = addr.toLowerCase();
  const today = dayKey();
  const cur = quotaMap.get(a);
  if (!cur || cur.dayKey !== today) {
    quotaMap.set(a, { dayKey: today, used: bytes });
    return { ok: true, remaining: QUOTA_BYTES - bytes };
  }
  if (cur.used + bytes > QUOTA_BYTES) {
    return { ok: false, used: cur.used, remaining: QUOTA_BYTES - cur.used };
  }
  cur.used += bytes;
  return { ok: true, remaining: QUOTA_BYTES - cur.used };
}

function authenticate(req) {
  const sig  = req.headers["x-wintg-signature"];
  const addr = req.headers["x-wintg-address"];
  const ts   = parseInt(req.headers["x-wintg-timestamp"] || "0", 10);

  if (!sig || !addr || !ts) {
    return { ok: false, error: "Missing X-Wintg-{Signature,Address,Timestamp} headers" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    return { ok: false, error: "Timestamp out of window (±5 min)" };
  }
  const message = `wintg-pin:${ts}`;
  let recovered;
  try {
    recovered = verifyMessage(message, sig);
  } catch (e) {
    return { ok: false, error: `Signature recover failed: ${e.message}` };
  }
  if (getAddress(recovered) !== getAddress(addr)) {
    return { ok: false, error: "Signature does not match address" };
  }
  return { ok: true, address: getAddress(addr) };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.type("text/plain").send("pinning-api-ok\n");
});

app.post("/pinning/pinFileToIPFS", upload.single("file"), async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth.ok) return res.status(401).json({ error: auth.error });
    if (!req.file) return res.status(400).json({ error: "No file uploaded (field 'file')" });

    const q = consumeQuota(auth.address, req.file.size);
    if (!q.ok) {
      return res.status(429).json({ error: `Daily quota exceeded (${QUOTA_BYTES} bytes)`, used: q.used });
    }

    // Forward to Kubo HTTP API.
    const fd = new FormData();
    fd.append("file", req.file.buffer, { filename: req.file.originalname || "file" });

    const r = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true&cid-version=1`, {
      method: "POST",
      body: fd,
      headers: fd.getHeaders(),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `IPFS add failed: ${r.status} ${text}` });
    }
    const text = await r.text();
    // Kubo returns one JSON line per file added; pick the last (the root).
    const lines = text.trim().split("\n").filter(Boolean);
    const last  = JSON.parse(lines[lines.length - 1]);

    res.json({
      IpfsHash: last.Hash,
      PinSize: parseInt(last.Size || `${req.file.size}`, 10),
      Timestamp: new Date().toISOString(),
      remainingQuotaBytes: q.remaining,
      uploader: auth.address,
    });
  } catch (e) {
    console.error("pinFileToIPFS error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/pinning/pinList", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth.ok) return res.status(401).json({ error: auth.error });
    const r = await fetch(`${IPFS_API_URL}/api/v0/pin/ls?type=recursive`, { method: "POST" });
    if (!r.ok) return res.status(502).json({ error: `IPFS pin/ls failed: ${r.status}` });
    const json = await r.json();
    res.json(json);
  } catch (e) {
    console.error("pinList error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/pinning/unpin/:cid", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth.ok) return res.status(401).json({ error: auth.error });
    const cid = req.params.cid;
    if (!cid || cid.length < 10) return res.status(400).json({ error: "Invalid CID" });
    const r = await fetch(`${IPFS_API_URL}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`, { method: "POST" });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `IPFS pin/rm failed: ${r.status} ${text}` });
    }
    res.json({ ok: true, cid });
  } catch (e) {
    console.error("unpin error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`WINTG pinning-api listening on ${PORT}, IPFS API → ${IPFS_API_URL}, quota ${QUOTA_BYTES} bytes/day/address`);
});
