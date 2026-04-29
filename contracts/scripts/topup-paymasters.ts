import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
async function main() {
  const [deployer] = await ethers.getSigners();
  const networkKey = network.name;
  const batch6 = JSON.parse(readFileSync(resolve(__dirname, `../deployments/${networkKey}-batch6.json`), "utf-8"));
  const pmAddr = batch6.contracts.WintgPaymaster.address;
  const tx = await deployer.sendTransaction({ to: pmAddr, value: ethers.parseEther("100") });
  await tx.wait();
  console.log(`Paymaster ${pmAddr} topupé avec 100 WTG sur ${networkKey}`);
}
main().catch(e => { console.error(e); process.exit(1); });
