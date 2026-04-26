import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_DAY = 86_400n;
const ONE_WTG = 10n ** 18n;

describe("PublicSaleVesting", () => {
  it("schedule : 25 % TGE, pas de cliff, 75 % sur 180 jours", async () => {
    const [owner, buyer1, buyer2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const cap = 100n * ONE_WTG;
    const c = await Factory.deploy(owner.address, start, cap);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: cap });

    expect(await c.tgeBps()).to.equal(2500);
    expect(await c.cliffDuration()).to.equal(0n);
    expect(await c.linearDuration()).to.equal(180n * ONE_DAY);

    await c.connect(owner).setAllocations(
      [buyer1.address, buyer2.address],
      [60n * ONE_WTG, 40n * ONE_WTG],
    );
    expect(await c.totalAllocated()).to.equal(100n * ONE_WTG);

    // Avant finalize : release impossible
    await time.increaseTo(start);
    await expect(c.connect(buyer1).release()).to.be.revertedWithCustomError(c, "NotFinalized");

    await c.connect(owner).finalize();

    // À TGE : 25 % de 60 = 15 WTG pour buyer1 (closeTo pour tolérer le drift de 1 bloc)
    expect(await c.getReleasable(buyer1.address)).to.be.closeTo(15n * ONE_WTG, ONE_WTG / 100n);
    const before = await ethers.provider.getBalance(buyer1.address);
    const tx = await c.connect(buyer1).release();
    const r = await tx.wait();
    const gasCost = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(buyer1.address);
    expect(after - before + gasCost).to.be.closeTo(15n * ONE_WTG, ONE_WTG / 100n);

    // À mi-linéaire (90j) : vesté = 25% + (75% * 0.5) = 62.5 % de 60 = 37.5 WTG
    await time.increaseTo(start + 90n * ONE_DAY);
    expect(await c.getReleasable(buyer1.address)).to.be.closeTo(225n * ONE_WTG / 10n, ONE_WTG / 10n);
  });

  it("rejette les doublons d'allocation", async () => {
    const [owner, buyer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, start, 100n * ONE_WTG);
    await c.waitForDeployment();

    await c.connect(owner).setAllocations([buyer.address], [10n * ONE_WTG]);
    await expect(
      c.connect(owner).setAllocations([buyer.address], [10n * ONE_WTG]),
    ).to.be.revertedWithCustomError(c, "AllocationAlreadySet");
  });

  it("rejette si cap dépassé", async () => {
    const [owner, b1, b2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, start, 100n * ONE_WTG);
    await c.waitForDeployment();

    await expect(
      c.connect(owner).setAllocations([b1.address, b2.address], [60n * ONE_WTG, 50n * ONE_WTG]),
    ).to.be.revertedWithCustomError(c, "CapExceeded");
  });

  it("finalize verrouille les allocations", async () => {
    const [owner, b1, b2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, start, 100n * ONE_WTG);
    await c.waitForDeployment();

    await c.connect(owner).setAllocations([b1.address], [10n * ONE_WTG]);
    await c.connect(owner).finalize();

    await expect(
      c.connect(owner).setAllocations([b2.address], [10n * ONE_WTG]),
    ).to.be.revertedWithCustomError(c, "AlreadyFinalized");

    await expect(c.connect(owner).finalize()).to.be.revertedWithCustomError(c, "AlreadyFinalized");
  });

  it("rejette setAllocations / finalize d'un non-owner", async () => {
    const [owner, stranger, buyer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const c = await Factory.deploy(owner.address, BigInt(await time.latest()) + 100n, 100n * ONE_WTG);
    await c.waitForDeployment();

    await expect(
      c.connect(stranger).setAllocations([buyer.address], [10n * ONE_WTG]),
    ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
    await expect(c.connect(stranger).finalize()).to.be.revertedWithCustomError(
      c,
      "OwnableUnauthorizedAccount",
    );
  });
});

describe("PrivateSaleVesting", () => {
  it("schedule : 10 % TGE, cliff 90j, 90 % sur 540j", async () => {
    const [owner, buyer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PrivateSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const cap = 100n * ONE_WTG;
    const c = await Factory.deploy(owner.address, start, cap);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: cap });

    expect(await c.tgeBps()).to.equal(1000);
    expect(await c.cliffDuration()).to.equal(90n * ONE_DAY);
    expect(await c.linearDuration()).to.equal(540n * ONE_DAY);

    await c.connect(owner).setAllocations([buyer.address], [100n * ONE_WTG]);
    await c.connect(owner).finalize();

    // À TGE : 10 % de 100 = 10
    await time.increaseTo(start);
    expect(await c.getReleasable(buyer.address)).to.equal(10n * ONE_WTG);

    // Pendant le cliff : toujours 10 (rien de plus ne se libère)
    await time.increaseTo(start + 60n * ONE_DAY);
    expect(await c.getReleasable(buyer.address)).to.equal(10n * ONE_WTG);

    // À mi-linéaire (cliff + 270j) : 10 + 90/2 = 55
    await time.increaseTo(start + 90n * ONE_DAY + 270n * ONE_DAY);
    expect(await c.getReleasable(buyer.address)).to.be.closeTo(55n * ONE_WTG, ONE_WTG / 10n);

    // À la fin : 100 %
    await time.increaseTo(start + 90n * ONE_DAY + 540n * ONE_DAY + 1n);
    expect(await c.getReleasable(buyer.address)).to.equal(100n * ONE_WTG);
  });
});
