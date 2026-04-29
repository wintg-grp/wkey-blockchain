/* eslint-disable no-console */
/**
 * multisig-oracle-operator.ts — autorise l'oracle pusher comme operator
 * du WtgCfaPriceOracle via multisig.
 */

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTreasurySigners, executeMultisigCall } from "./multisig-helper";

const ORACLE_PUSHER = "0xf9f224010a041af8d74d3E5e720b35A33557617B";

async function main() {
  const networkKey = network.name;
  const phase1 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}.json`), "utf-8"));
  const batch5 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch5.json`), "utf-8"));

  const treasuryAddr = phase1.contracts.WINTGTreasury.address;
  const oracleAddr = batch5.contracts.WtgCfaPriceOracle.address;

  const treasury = await ethers.getContractAt("WINTGTreasury", treasuryAddr);
  const threshold = Number(await treasury.threshold());
  const signers = await loadTreasurySigners(ethers.provider);
  const oracle = await ethers.getContractAt("WtgCfaPriceOracle", oracleAddr);

  console.log(`\n🌍 ${networkKey}`);
  console.log(`📦 Oracle  : ${oracleAddr}`);
  console.log(`🤖 Pusher  : ${ORACLE_PUSHER}`);

  const isOp = await oracle.isOperator(ORACLE_PUSHER);
  if (isOp) {
    console.log(`✓ Pusher déjà operator — skip`);
    return;
  }

  const data = oracle.interface.encodeFunctionData("setOperator", [ORACLE_PUSHER, true]);
  await executeMultisigCall({
    treasury: treasury as any, to: oracleAddr, value: 0n, data,
    threshold, signers, description: `oracle.setOperator(${ORACLE_PUSHER}, true)`,
  });

  const isOpAfter = await oracle.isOperator(ORACLE_PUSHER);
  console.log(`verif: isOperator = ${isOpAfter ? "✅" : "❌"}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
