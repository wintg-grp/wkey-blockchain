import { expect } from "chai";
import { ethers } from "hardhat";

const ONE_WTG = 10n ** 18n;
const BURN_ADDR = "0x000000000000000000000000000000000000dEaD";

describe("BurnContract", () => {
  it("burn envoie le solde à 0x...dEaD et incrémente totalBurned", async () => {
    const [funder] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BurnContract");
    const c = await Factory.deploy();
    await c.waitForDeployment();

    await funder.sendTransaction({ to: await c.getAddress(), value: 10n * ONE_WTG });
    expect(await c.pendingBurn()).to.equal(10n * ONE_WTG);

    const burnBefore = await ethers.provider.getBalance(BURN_ADDR);
    await expect(c.burnPending())
      .to.emit(c, "Burned")
      .withArgs(funder.address, 10n * ONE_WTG, 10n * ONE_WTG);
    const burnAfter = await ethers.provider.getBalance(BURN_ADDR);

    expect(burnAfter - burnBefore).to.equal(10n * ONE_WTG);
    expect(await c.totalBurned()).to.equal(10n * ONE_WTG);
    expect(await c.pendingBurn()).to.equal(0n);
  });

  it("burn revert si solde nul", async () => {
    const Factory = await ethers.getContractFactory("BurnContract");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    await expect(c.burnPending()).to.be.revertedWithCustomError(c, "NothingToBurn");
  });
});

describe("FeeDistributor", () => {
  it("splits 40/50/5/5 and routes rounding dust into the community pool", async () => {
    const [owner, treasury, validators, community] = await ethers.getSigners();

    const Burn = await ethers.getContractFactory("BurnContract");
    const burn = await Burn.deploy();
    await burn.waitForDeployment();

    const Distrib = await ethers.getContractFactory("FeeDistributor");
    const d = await Distrib.deploy(
      owner.address,
      treasury.address,
      validators.address,
      await burn.getAddress(),
      community.address,
    );
    await d.waitForDeployment();

    // Send 100 WTG (round number to make the math obvious)
    await owner.sendTransaction({ to: await d.getAddress(), value: 100n * ONE_WTG });

    const tBefore = await ethers.provider.getBalance(treasury.address);
    const vBefore = await ethers.provider.getBalance(validators.address);
    const cBefore = await ethers.provider.getBalance(community.address);

    await expect(d.distribute())
      .to.emit(d, "Distributed")
      .withArgs(40n * ONE_WTG, 50n * ONE_WTG, 5n * ONE_WTG, 5n * ONE_WTG);

    const tAfter = await ethers.provider.getBalance(treasury.address);
    const vAfter = await ethers.provider.getBalance(validators.address);
    const cAfter = await ethers.provider.getBalance(community.address);

    expect(tAfter - tBefore).to.equal(40n * ONE_WTG);
    expect(vAfter - vBefore).to.equal(50n * ONE_WTG);
    expect(await burn.pendingBurn()).to.equal(5n * ONE_WTG);
    expect(cAfter - cBefore).to.equal(5n * ONE_WTG);
    expect(await d.cumulativeDistributed()).to.equal(100n * ONE_WTG);
  });

  it("reverts when there's nothing to distribute", async () => {
    const [owner, t, v, c] = await ethers.getSigners();
    const Burn = await ethers.getContractFactory("BurnContract");
    const burn = await Burn.deploy();
    const Distrib = await ethers.getContractFactory("FeeDistributor");
    const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress(), c.address);
    await expect(d.distribute()).to.be.revertedWithCustomError(d, "NothingToDistribute");
  });

  it("setRecipients is owner-only and rejects zero addresses", async () => {
    const [owner, t, v, c, stranger] = await ethers.getSigners();
    const Burn = await ethers.getContractFactory("BurnContract");
    const burn = await Burn.deploy();
    const Distrib = await ethers.getContractFactory("FeeDistributor");
    const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress(), c.address);

    await expect(
      d.connect(stranger).setRecipients(stranger.address, stranger.address, stranger.address, stranger.address),
    ).to.be.revertedWithCustomError(d, "OwnableUnauthorizedAccount");

    await expect(
      d.connect(owner).setRecipients(ethers.ZeroAddress, v.address, await burn.getAddress(), c.address),
    ).to.be.revertedWithCustomError(d, "ZeroAddress");
  });

  it("constants: sum(BPS) = 10_000", async () => {
    const [owner, t, v, c] = await ethers.getSigners();
    const Burn = await ethers.getContractFactory("BurnContract");
    const burn = await Burn.deploy();
    const Distrib = await ethers.getContractFactory("FeeDistributor");
    const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress(), c.address);

    expect(await d.TREASURY_BPS()).to.equal(4000);
    expect(await d.VALIDATOR_BPS()).to.equal(5000);
    expect(await d.BURN_BPS()).to.equal(500);
    expect(await d.COMMUNITY_BPS()).to.equal(500);
  });
});
