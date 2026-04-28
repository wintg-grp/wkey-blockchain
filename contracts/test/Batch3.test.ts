/**
 * Batch 3 — Official tokens smoke test.
 * WWTG, WKEY (100M cap), USDW, WCFA.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("Batch 3 — Official tokens", () => {
  let owner: Signer;
  let admin: Signer;
  let alice: Signer;

  let registry: any;

  beforeEach(async () => {
    [owner, admin, alice] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("VerificationRegistry");
    registry = await Reg.deploy(await owner.getAddress(), await admin.getAddress(), await admin.getAddress());
  });

  /* ------------------------ WrappedWTG ------------------------ */

  it("WrappedWTG: deposit + withdraw is 1:1", async () => {
    const WWTG = await ethers.getContractFactory("WrappedWTG");
    const wwtg = await WWTG.deploy(await admin.getAddress(), await registry.getAddress(), "ipfs://QmWwtg");

    await wwtg.connect(alice).deposit({ value: ethers.parseEther("10") });
    expect(await wwtg.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("10"));
    expect(await ethers.provider.getBalance(await wwtg.getAddress())).to.equal(ethers.parseEther("10"));

    const before = await ethers.provider.getBalance(await alice.getAddress());
    const tx = await wwtg.connect(alice).withdraw(ethers.parseEther("5"));
    const r = await tx.wait();
    const gasUsed = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(await alice.getAddress());

    expect(after - before + gasUsed).to.equal(ethers.parseEther("5"));
    expect(await wwtg.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("5"));
  });

  it("WrappedWTG: receive() also mints", async () => {
    const WWTG = await ethers.getContractFactory("WrappedWTG");
    const wwtg = await WWTG.deploy(await admin.getAddress(), await registry.getAddress(), "");
    await alice.sendTransaction({ to: await wwtg.getAddress(), value: ethers.parseEther("1") });
    expect(await wwtg.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("1"));
  });

  it("WrappedWTG: setVerificationTier only by registry", async () => {
    const WWTG = await ethers.getContractFactory("WrappedWTG");
    const wwtg = await WWTG.deploy(await admin.getAddress(), await registry.getAddress(), "");
    await expect(wwtg.connect(admin).setVerificationTier(3)).to.be.reverted;
    // Set via registry.setOfficial (owner-only)
    await registry.connect(owner).setOfficial(await wwtg.getAddress());
    expect(await wwtg.verificationTier()).to.equal(3n);
  });

  /* ------------------------ WKEY ------------------------ */

  it("WKEY: deploys with 30M initial / 100M cap, votes activated", async () => {
    const WKEY = await ethers.getContractFactory("WKEYToken");
    const wkey = await WKEY.deploy(await admin.getAddress(), await registry.getAddress(), "ipfs://QmWkey");

    expect(await wkey.name()).to.equal("WKEY");
    expect(await wkey.symbol()).to.equal("WKEY");
    expect(await wkey.cap()).to.equal(ethers.parseEther("100000000"));
    expect(await wkey.totalSupply()).to.equal(ethers.parseEther("30000000"));
    expect(await wkey.balanceOf(await admin.getAddress())).to.equal(ethers.parseEther("30000000"));
    expect(await wkey.hasVotes()).to.equal(true);
    expect(await wkey.isMintable()).to.equal(true);
    expect(await wkey.isSoulbound()).to.equal(false);
  });

  it("WKEY: mint progressive blocked by cap", async () => {
    const WKEY = await ethers.getContractFactory("WKEYToken");
    const wkey = await WKEY.deploy(await admin.getAddress(), await registry.getAddress(), "");
    // mint 70M more → reach 100M (the cap)
    await wkey.connect(admin).mint(await alice.getAddress(), ethers.parseEther("70000000"));
    expect(await wkey.totalSupply()).to.equal(ethers.parseEther("100000000"));
    // 1 wei more should revert
    await expect(wkey.connect(admin).mint(await alice.getAddress(), 1n)).to.be.reverted;
  });

  /* ------------------------ USDW ------------------------ */

  it("USDW: mint requires MINTER_ROLE; pause blocks transfers", async () => {
    const USDW = await ethers.getContractFactory("USDWToken");
    const usdw = await USDW.deploy(await admin.getAddress(), await registry.getAddress(), "ipfs://QmUsdw");

    await usdw.connect(admin).mint(await alice.getAddress(), ethers.parseEther("1000"));
    expect(await usdw.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("1000"));

    await expect(usdw.connect(alice).mint(await alice.getAddress(), 1n)).to.be.reverted;

    await usdw.connect(admin).pause();
    await expect(usdw.connect(alice).transfer(await admin.getAddress(), 1n)).to.be.reverted;

    await usdw.connect(admin).unpause();
    await usdw.connect(alice).transfer(await admin.getAddress(), 1n);
    expect(await usdw.balanceOf(await admin.getAddress())).to.equal(1n);
  });

  /* ------------------------ WCFA ------------------------ */

  it("WCFA: name/symbol corrects", async () => {
    const WCFA = await ethers.getContractFactory("WCFAToken");
    const wcfa = await WCFA.deploy(await admin.getAddress(), await registry.getAddress(), "");
    expect(await wcfa.name()).to.equal("CFA WINTG");
    expect(await wcfa.symbol()).to.equal("WCFA");
  });
});
