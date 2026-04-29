/* eslint-disable no-console */
/**
 * multisig-set-token-logos.ts — appelle setLogoURI() sur les 4 tokens
 * officiels (WWTG, WKEY, USDW, WCFA) via le multisig.
 *
 * Lit les CIDs depuis les variables d'environnement :
 *   WWTG_LOGO_URI, WKEY_LOGO_URI, USDW_LOGO_URI, WCFA_LOGO_URI
 *
 * Usage :
 *   WALLETS_PASSPHRASE=... \
 *   WWTG_LOGO_URI="ipfs://..." \
 *   WKEY_LOGO_URI="ipfs://..." \
 *   USDW_LOGO_URI="ipfs://..." \
 *   WCFA_LOGO_URI="ipfs://..." \
 *   npx hardhat run scripts/multisig-set-token-logos.ts --network wintgMainnet
 */

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

async function main() {
  const networkKey = network.name;
  const batch3 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch3.json`), "utf-8"));
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));

  const treasuryAddr: string = phase1.contracts.WINTGTreasury.address;
  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);

  const targets = [
    { name: "WrappedWTG", address: batch3.contracts.WrappedWTG.address, uri: process.env.WWTG_LOGO_URI },
    { name: "WKEYToken",  address: batch3.contracts.WKEYToken.address,  uri: process.env.WKEY_LOGO_URI },
    { name: "USDWToken",  address: batch3.contracts.USDWToken.address,  uri: process.env.USDW_LOGO_URI },
    { name: "WCFAToken",  address: batch3.contracts.WCFAToken.address,  uri: process.env.WCFA_LOGO_URI },
  ];

  console.log(`\n🌍 Réseau : ${networkKey}`);
  console.log(`🔐 Threshold ${threshold}-of-${signers.length}\n`);

  // Helper to call setLogoURI — but each token has its own owner / role.
  // WWTG: Ownable2Step, owner = treasury (multisig)
  // WKEY/USDW/WCFA: AccessControl, DEFAULT_ADMIN_ROLE on treasury
  // → in both cases, the treasury (multisig) is authorized.

  for (const t of targets) {
    if (!t.uri || t.uri.length < 7) {
      console.log(`⚠️  ${t.name}: missing or invalid LOGO_URI env var → skip`);
      continue;
    }
    console.log(`📦 ${t.name} @ ${t.address}`);
    console.log(`   newLogoURI = ${t.uri}`);

    // Build calldata for setLogoURI(string)
    const iface = new ethers.Interface(["function setLogoURI(string calldata uri)"]);
    const data = iface.encodeFunctionData("setLogoURI", [t.uri]);

    await executeMultisigCall({
      treasury: treasury as any,
      to: t.address,
      value: 0n,
      data,
      threshold,
      signers,
      description: `${t.name}.setLogoURI(${t.uri.slice(0, 30)}...)`,
    });

    // Verify
    const c = new ethers.Contract(t.address, ["function logoURI() view returns (string)"], ethers.provider);
    const after = await c.logoURI();
    console.log(`   verif: logoURI() = ${after === t.uri ? "✅" : "❌"}`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
