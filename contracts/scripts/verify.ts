/* eslint-disable no-console */
/**
 * verify.ts — Vérifie les sources des contrats déployés sur Blockscout.
 * Lit `deployments/<network>.json` et envoie chaque contrat à
 * `hardhat verify` (avec endpoint Blockscout configuré dans hardhat.config.ts).
 *
 * Usage :
 *   npx hardhat run scripts/verify.ts --network wintgTestnet
 */

import { network, run } from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface DeploymentFile {
  network: string;
  chainId: string;
  contracts: Record<string, { address: string; constructorArgs: unknown[] }>;
}

async function main() {
  const path = resolve(__dirname, "..", "deployments", `${network.name}.json`);
  if (!existsSync(path)) {
    console.error(`Fichier ${path} introuvable. Déployer d'abord avec deploy.ts.`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(path, "utf8")) as DeploymentFile;
  console.log(`🔍 Vérification de ${Object.keys(data.contracts).length} contrats sur ${network.name}...`);

  for (const [name, info] of Object.entries(data.contracts)) {
    try {
      await run("verify:verify", {
        address: info.address,
        constructorArguments: info.constructorArgs,
      });
      console.log(`  ✓ ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Already Verified")) {
        console.log(`  ⊘ ${name} (déjà vérifié)`);
      } else {
        console.warn(`  ⚠ ${name} : ${msg.split("\n")[0]}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
