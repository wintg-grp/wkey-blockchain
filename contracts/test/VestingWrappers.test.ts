import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_DAY = 86_400n;
const ONE_WTG = 10n ** 18n;

describe("Vesting wrappers (Team, Advisors, Ecosystem, Treasury, Partners)", () => {
  it("TeamVesting : 0% TGE, cliff 365j, linéaire 1095j, revocable", async () => {
    const [owner, beneficiary] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TeamVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 10n * ONE_WTG;
    const c = await Factory.deploy(owner.address, beneficiary.address, start, total);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: total });

    expect(await c.cliff()).to.equal(365n * ONE_DAY);
    expect(await c.linearDuration()).to.equal(1095n * ONE_DAY);
    expect(await c.tgeAmount()).to.equal(0n);
    expect(await c.revocable()).to.be.true;

    // Pendant le cliff : rien
    await time.increaseTo(start + 100n * ONE_DAY);
    expect(await c.getReleasable()).to.equal(0n);

    // Après cliff + moitié du linéaire : 50% libéré
    await time.increaseTo(start + 365n * ONE_DAY + 547n * ONE_DAY);
    expect(await c.getReleasable()).to.be.closeTo(total / 2n, ONE_WTG / 50n);
  });

  it("AdvisorsVesting : cliff 180j, linéaire 540j, revocable", async () => {
    const [owner, beneficiary] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AdvisorsVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 10n * ONE_WTG;
    const c = await Factory.deploy(owner.address, beneficiary.address, start, total);
    await c.waitForDeployment();

    expect(await c.cliff()).to.equal(180n * ONE_DAY);
    expect(await c.linearDuration()).to.equal(540n * ONE_DAY);
    expect(await c.revocable()).to.be.true;
  });

  it("EcosystemVesting : 5% TGE, pas de cliff, linéaire 1460j, non-revocable", async () => {
    const [owner, beneficiary] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EcosystemVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 200n * ONE_WTG;
    const c = await Factory.deploy(owner.address, beneficiary.address, start, total);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: total });

    expect(await c.cliff()).to.equal(0n);
    expect(await c.tgeAmount()).to.equal(total / 20n); // 5 %
    expect(await c.revocable()).to.be.false;

    await time.increaseTo(start);
    expect(await c.getReleasable()).to.equal(total / 20n);

    await expect(c.connect(owner).revoke()).to.be.revertedWithCustomError(c, "NotRevocable");
  });

  it("TreasuryVesting : 10% TGE, cliff 180j, linéaire 1460j, non-revocable", async () => {
    const [owner, beneficiary] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TreasuryVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 100n * ONE_WTG;
    const c = await Factory.deploy(owner.address, beneficiary.address, start, total);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: total });

    expect(await c.tgeAmount()).to.equal(total / 10n);
    expect(await c.cliff()).to.equal(180n * ONE_DAY);

    await time.increaseTo(start);
    expect(await c.getReleasable()).to.equal(total / 10n);
  });

  it("PartnersVesting : 0% TGE, cliff 180j, linéaire 730j, non-revocable", async () => {
    const [owner, beneficiary] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PartnersVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 20n * ONE_WTG;
    const c = await Factory.deploy(owner.address, beneficiary.address, start, total);
    await c.waitForDeployment();

    expect(await c.cliff()).to.equal(180n * ONE_DAY);
    expect(await c.linearDuration()).to.equal(730n * ONE_DAY);
    expect(await c.revocable()).to.be.false;
  });
});

describe("StakingRewardsReserve", () => {
  it("respecte le rate limit journalier de 1 % du total", async () => {
    const [owner, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("StakingRewardsReserve");
    const total = 1000n * ONE_WTG;
    const c = await Factory.deploy(owner.address, total);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: total });

    // 1 % de 1000 = 10 WTG/jour
    expect(await c.dailyLimit()).to.equal(10n * ONE_WTG);

    // Premier retrait : 5 WTG OK
    await c.connect(owner).withdraw(recipient.address, 5n * ONE_WTG);
    expect(await c.totalWithdrawn()).to.equal(5n * ONE_WTG);

    // Encore 5 WTG sur la même journée OK
    await c.connect(owner).withdraw(recipient.address, 5n * ONE_WTG);

    // 1 wei de plus : revert
    await expect(c.connect(owner).withdraw(recipient.address, 1n)).to.be.revertedWithCustomError(
      c,
      "DailyLimitExceeded",
    );

    // J+1 : la fenêtre se reset
    await time.increase(ONE_DAY + 1n);
    expect(await c.remainingToday()).to.equal(10n * ONE_WTG);
    await c.connect(owner).withdraw(recipient.address, 10n * ONE_WTG);
  });

  it("seul l'owner peut retirer", async () => {
    const [owner, stranger, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("StakingRewardsReserve");
    const c = await Factory.deploy(owner.address, 1000n * ONE_WTG);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: 1000n * ONE_WTG });

    await expect(
      c.connect(stranger).withdraw(recipient.address, 1n * ONE_WTG),
    ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
  });

  it("pause bloque withdraw, unpause le ré-active", async () => {
    const [owner, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("StakingRewardsReserve");
    const c = await Factory.deploy(owner.address, 1000n * ONE_WTG);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: 1000n * ONE_WTG });

    await c.connect(owner).pause();
    await expect(c.connect(owner).withdraw(recipient.address, 1n * ONE_WTG)).to.be.revertedWithCustomError(
      c,
      "EnforcedPause",
    );
    await c.connect(owner).unpause();
    await expect(c.connect(owner).withdraw(recipient.address, 1n * ONE_WTG)).to.not.be.reverted;
  });
});
