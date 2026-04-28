import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const signers = [
    "0x45226d416A7a56F2794D82D45Be30941eAaC9c94",
    "0xFe581097c074944B5B87d9Fe1DaA16e7D89AB5Af",
    "0x50253f10CfFb63d7Be12b374FEDb65Da4725a7f2",
    "0x350ce31908B9639Cab66b2086F35372E7F1552C4",
    "0xA943f800c4E461BCB3b3D67Bc054a6188010306D",
  ];
  console.log(`Funding 5 signers with 1 WTG each on ${network.name}...`);
  for (const s of signers) {
    const bal = await ethers.provider.getBalance(s);
    if (bal >= ethers.parseEther("0.5")) { console.log(`  ${s} already has ${ethers.formatEther(bal)} WTG, skip`); continue; }
    const tx = await deployer.sendTransaction({ to: s, value: ethers.parseEther("1") });
    await tx.wait();
    console.log(`  ${s} funded ✅`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
