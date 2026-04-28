/**
 * Batch 5 — DeFi smoke test (TimelockEscrow + LayawayEscrow + StakingFactory + Oracle).
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("Batch 5 — DeFi", () => {
  let owner: Signer, treasury: Signer, alice: Signer, bob: Signer;
  let mockToken: any;

  beforeEach(async () => {
    [owner, treasury, alice, bob] = await ethers.getSigners();
    const ERC = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC.deploy();
  });

  /* --------------------------- TimelockEscrow --------------------------- */

  it("TimelockEscrow: send → claim after unlock", async () => {
    const T = await ethers.getContractFactory("TimelockEscrow");
    const t = await T.deploy();

    await mockToken.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await mockToken.connect(alice).approve(await t.getAddress(), ethers.parseEther("100"));

    await t.connect(alice).send(await bob.getAddress(), await mockToken.getAddress(), ethers.parseEther("100"), 86400);
    expect(await mockToken.balanceOf(await t.getAddress())).to.equal(ethers.parseEther("100"));

    // Cannot claim early.
    await expect(t.connect(bob).claim(0)).to.be.reverted;

    // Time-travel + claim.
    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);
    await t.connect(bob).claim(0);
    expect(await mockToken.balanceOf(await bob.getAddress())).to.equal(ethers.parseEther("100"));
  });

  it("TimelockEscrow: cancel by sender before unlock", async () => {
    const T = await ethers.getContractFactory("TimelockEscrow");
    const t = await T.deploy();

    await t.connect(alice).send(
      await bob.getAddress(), NATIVE, ethers.parseEther("1"), 60,
      { value: ethers.parseEther("1") }
    );
    const before = await ethers.provider.getBalance(await alice.getAddress());
    const tx = await t.connect(alice).cancel(0);
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(await alice.getAddress());
    expect(after - before + gas).to.equal(ethers.parseEther("1"));
  });

  it("TimelockEscrow: acceptEarly skips timelock", async () => {
    const T = await ethers.getContractFactory("TimelockEscrow");
    const t = await T.deploy();
    await t.connect(alice).send(
      await bob.getAddress(), NATIVE, ethers.parseEther("1"), 86400,
      { value: ethers.parseEther("1") }
    );
    await t.connect(bob).acceptEarly(0);
    // bob now has the funds.
  });

  /* --------------------------- LayawayEscrow --------------------------- */

  it("LayawayEscrow: 3-installments full flow", async () => {
    const L = await ethers.getContractFactory("LayawayEscrow");
    const l = await L.deploy(await owner.getAddress(), await treasury.getAddress());

    // Merchant = bob, Buyer = alice
    await l.connect(bob).createPlan(
      await alice.getAddress(),
      await mockToken.getAddress(),
      ethers.parseEther("300"),  // total 300
      3,                          // 3 installments → 100 each
      86400 * 7,                  // weekly
      0,                          // no late fee
      86400                       // 1d grace
    );

    // Alice approves + accepts (pays 100)
    await mockToken.transfer(await alice.getAddress(), ethers.parseEther("500"));
    await mockToken.connect(alice).approve(await l.getAddress(), ethers.parseEther("300"));

    await l.connect(alice).accept(0);
    await l.connect(alice).pay(0);
    await l.connect(alice).pay(0);

    const plan = await l.plans(0);
    expect(plan.paidInstallments).to.equal(3n);
    expect(plan.status).to.equal(2n); // Completed

    // Treasury got 0,5 % × 3 × 100 = 1,5 WTG
    expect(await mockToken.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther("1.5"));
  });

  /* --------------------------- StakingFactory + Pool --------------------------- */

  it("StakingFactory: create pool + stake/withdraw flow", async () => {
    const SF = await ethers.getContractFactory("StakingFactory");
    const sf = await SF.deploy(await owner.getAddress(), await treasury.getAddress(), await treasury.getAddress());

    await sf.connect(owner).addTeamMember(await alice.getAddress());

    const reward = await (await ethers.getContractFactory("MockERC20")).deploy();
    const tx = await sf.connect(alice).createPool(
      await mockToken.getAddress(), await reward.getAddress(),
      0, 0,                        // no lock
      ethers.parseEther("1"),      // 1 reward / second
    );
    const r = await tx.wait();
    const ev = r!.logs.find((l: any) => l.fragment?.name === "PoolCreated") as any;
    const poolAddr = ev.args[0];
    const pool = await ethers.getContractAt("StakingPool", poolAddr);

    // Mint stake + reward tokens for the test.
    await mockToken.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await reward.transfer(poolAddr, ethers.parseEther("1000"));

    await mockToken.connect(alice).approve(poolAddr, ethers.parseEther("100"));
    await pool.connect(alice).stake(ethers.parseEther("100"));
    expect(await pool.balances(await alice.getAddress())).to.equal(ethers.parseEther("100"));

    // Time forward 100s → 100 reward tokens earned.
    await ethers.provider.send("evm_increaseTime", [100]);
    await ethers.provider.send("evm_mine", []);
    const earned = await pool.earned(await alice.getAddress());
    expect(earned).to.be.gt(ethers.parseEther("99")); // approx 100

    await pool.connect(alice).claim();
    expect(await reward.balanceOf(await alice.getAddress())).to.be.gt(0);
  });

  /* --------------------------- WtgCfaPriceOracle --------------------------- */

  it("WtgCfaPriceOracle: push + stale flag", async () => {
    const O = await ethers.getContractFactory("WtgCfaPriceOracle");
    const o = await O.deploy(await owner.getAddress(), await alice.getAddress(), 5_000_000_000n); // 50 CFA × 1e8

    expect(await o.latestPrice()).to.equal(5_000_000_000n);
    expect(await o.isStale()).to.equal(false);

    // Push from operator
    await o.connect(alice).pushPrice(5_010_000_000n);
    expect(await o.latestPrice()).to.equal(5_010_000_000n);

    // Time-travel beyond heartbeat → stale
    await ethers.provider.send("evm_increaseTime", [3700]);
    await ethers.provider.send("evm_mine", []);
    expect(await o.isStale()).to.equal(true);
  });
});
