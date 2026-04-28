/**
 * Batch 6 — Apps & Infra smoke test.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("Batch 6 — Apps & Infra", () => {
  let owner: Signer, treasury: Signer, admin: Signer, alice: Signer, bob: Signer;

  beforeEach(async () => {
    [owner, treasury, admin, alice, bob] = await ethers.getSigners();
  });

  /* --------------------------- AppRegistry --------------------------- */

  it("AppRegistry: register + verify flow + flag", async () => {
    const AR = await ethers.getContractFactory("AppRegistry");
    const ar = await AR.deploy(await owner.getAddress(), await treasury.getAddress(), await admin.getAddress());

    // Register app (alice = creator), 50 WTG fee.
    const tx = await ar.connect(alice).register(
      "WKey",
      "Sovereign WINTG wallet",
      "https://wkey.app",
      "ipfs://QmManifest",
      "wallet",
      [],
      { value: ethers.parseEther("50") },
    );
    const r = await tx.wait();
    const ev = r!.logs.find((l: any) => l.fragment?.name === "AppRegistered") as any;
    const appId = ev.args[0];

    const a = await ar.apps(appId);
    expect(a.tier).to.equal(1n); // FactoryCreated
    expect(a.creator).to.equal(await alice.getAddress());

    // Request verification (500 WTG)
    await ar.connect(alice).requestVerification(appId, { value: ethers.parseEther("500") });

    // Admin approves
    await ar.connect(admin).approveVerification(appId);
    expect((await ar.apps(appId)).tier).to.equal(2n);

    // Flag
    await ar.connect(admin).flag(appId, "ipfs://QmReportFraud");
    expect((await ar.apps(appId)).flagged).to.equal(true);
  });

  it("AppRegistry: free for team members", async () => {
    const AR = await ethers.getContractFactory("AppRegistry");
    const ar = await AR.deploy(await owner.getAddress(), await treasury.getAddress(), await admin.getAddress());
    await ar.connect(owner).addTeamMember(await alice.getAddress());
    await ar.connect(alice).register("Team app", "by team", "https://x.io", "ipfs://Qm123456", "utility", [], { value: 0 });
  });

  it("AppRegistry: wrong fee reverts", async () => {
    const AR = await ethers.getContractFactory("AppRegistry");
    const ar = await AR.deploy(await owner.getAddress(), await treasury.getAddress(), await admin.getAddress());
    await expect(
      ar.connect(alice).register("X", "x", "x", "ipfs://Qm123456", "x", [], { value: ethers.parseEther("10") })
    ).to.be.reverted;
  });

  /* --------------------------- WintgPaymaster --------------------------- */

  it("WintgPaymaster: deploys + accepts topup + pause", async () => {
    const PM = await ethers.getContractFactory("WintgPaymaster");
    const pm = await PM.deploy(await owner.getAddress(), await admin.getAddress(), await treasury.getAddress());

    // Topup
    await alice.sendTransaction({ to: await pm.getAddress(), value: ethers.parseEther("10") });
    expect(await pm.balance()).to.equal(ethers.parseEther("10"));

    // Pause
    await pm.connect(owner).pause();
    expect(await pm.paused()).to.equal(true);

    // Withdraw goes to treasury
    const before = await ethers.provider.getBalance(await treasury.getAddress());
    await pm.connect(owner).withdraw(ethers.parseEther("3"));
    const after = await ethers.provider.getBalance(await treasury.getAddress());
    expect(after - before).to.equal(ethers.parseEther("3"));
  });

  it("WintgPaymaster: limits config", async () => {
    const PM = await ethers.getContractFactory("WintgPaymaster");
    const pm = await PM.deploy(await owner.getAddress(), await admin.getAddress(), await treasury.getAddress());
    await pm.connect(owner).setLimits(20, 1_000_000, 500); // 20/day, 1M gas, 5%
    expect(await pm.maxTxPerDay()).to.equal(20n);
    expect(await pm.maxGasPerTx()).to.equal(1_000_000n);
    expect(await pm.markupBps()).to.equal(500n);
  });
});
