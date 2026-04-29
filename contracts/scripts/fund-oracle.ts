import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const ORACLE = "0xf9f224010a041af8d74d3E5e720b35A33557617B";
  const tx = await deployer.sendTransaction({ to: ORACLE, value: ethers.parseEther("5") });
  await tx.wait();
  console.log(`Oracle pusher fundé avec 5 WTG (gas pour ~10 ans de pushes)`);
}
main().catch(e => { console.error(e); process.exit(1); });
