import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE = 10n ** 18n;
const USD_8 = 10n ** 8n;

beforeEach(async () => {
  await network.provider.send("hardhat_reset");
});

async function deployStablecoinFixture() {
  const [owner, alice, bob, treasury, op1, op2, op3] = await ethers.getSigners();

  // Oracle WTG/USD : 8 décimales (Chainlink-style), prix initial 1 USD/WTG
  const Oracle = await ethers.getContractFactory("OracleAggregator");
  const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 86400, 9999);
  await oracle.setOperators([op1.address, op2.address, op3.address]);
  // Pousser un prix initial pour que latestRoundData fonctionne
  await oracle.connect(op1).submitPrice(1n * USD_8);
  await oracle.connect(op2).submitPrice(1n * USD_8);
  await oracle.connect(op3).submitPrice(1n * USD_8);

  const USDW = await ethers.getContractFactory("USDW");
  const usdw = await USDW.deploy(
    owner.address,
    await oracle.getAddress(),
    treasury.address,
    200,                                 // 2 % stability fee
    1_000_000_000n * ONE,                // 1B USDW debt ceiling
  );

  return { usdw, oracle, owner, alice, bob, treasury, op1, op2, op3 };
}

describe("USDW (stablecoin)", () => {
  it("metadata ERC20", async () => {
    const { usdw } = await deployStablecoinFixture();
    expect(await usdw.name()).to.equal("WINTG USD");
    expect(await usdw.symbol()).to.equal("USDW");
    expect(await usdw.decimals()).to.equal(18);
  });

  it("openOrIncrease : lock 100 WTG + mint 50 USDW (LTV 50% à 1 USD/WTG)", async () => {
    const { usdw, alice } = await deployStablecoinFixture();
    await usdw.connect(alice).openOrIncrease(50n * ONE, { value: 100n * ONE });

    const pos = await usdw.positions(alice.address);
    expect(pos.collateral).to.equal(100n * ONE);
    expect(pos.debt).to.equal(50n * ONE);
    expect(await usdw.balanceOf(alice.address)).to.equal(50n * ONE);

    // LTV = 50% = 5000 bps
    expect(await usdw.ltvOf(alice.address)).to.be.closeTo(5000n, 5n);
    expect(await usdw.isLiquidable(alice.address)).to.be.false;
  });

  it("openOrIncrease : revert si LTV > 66%", async () => {
    const { usdw, alice } = await deployStablecoinFixture();
    // 100 WTG @ 1$/WTG = 100 USD collatéral
    // 67 USDW = 67% LTV → > 66% MAX_LTV
    await expect(
      usdw.connect(alice).openOrIncrease(67n * ONE, { value: 100n * ONE }),
    ).to.be.revertedWithCustomError(usdw, "ExceedsLtv");
  });

  it("repay : burn USDW + dette diminue", async () => {
    const { usdw, alice } = await deployStablecoinFixture();
    await usdw.connect(alice).openOrIncrease(50n * ONE, { value: 100n * ONE });
    await usdw.connect(alice).repay(20n * ONE);

    const pos = await usdw.positions(alice.address);
    // ~30 USDW + petite stability fee accrue entre les 2 tx
    expect(pos.debt).to.be.closeTo(30n * ONE, ONE / 100n);
    expect(await usdw.balanceOf(alice.address)).to.equal(30n * ONE);
  });

  it("withdrawCollateral : OK si LTV reste sain", async () => {
    const { usdw, alice } = await deployStablecoinFixture();
    await usdw.connect(alice).openOrIncrease(50n * ONE, { value: 100n * ONE });
    // Retirer 20 WTG : nouveau collatéral 80 WTG, dette 50 USDW → LTV 62.5% (OK)
    await usdw.connect(alice).withdrawCollateral(20n * ONE);
    const pos = await usdw.positions(alice.address);
    expect(pos.collateral).to.equal(80n * ONE);
  });

  it("withdrawCollateral : revert si LTV dépasse", async () => {
    const { usdw, alice } = await deployStablecoinFixture();
    await usdw.connect(alice).openOrIncrease(50n * ONE, { value: 100n * ONE });
    // Retirer 30 WTG → 70 WTG / 50 USDW = 71.4% LTV → > 66%
    await expect(
      usdw.connect(alice).withdrawCollateral(30n * ONE),
    ).to.be.revertedWithCustomError(usdw, "ExceedsLtv");
  });

  it("liquidate : si LTV > 80% (chute de prix WTG)", async () => {
    const { usdw, oracle, alice, bob, op1, op2, op3 } = await deployStablecoinFixture();

    // Alice ouvre une position au max safe : 60% LTV (60 USDW pour 100 WTG)
    await usdw.connect(alice).openOrIncrease(60n * ONE, { value: 100n * ONE });

    // Le prix WTG/USD chute : 0.7 USD/WTG
    // Nouveau LTV = 60 / (100 × 0.7) = 60 / 70 = 85.7% > 80% → liquidable
    await oracle.connect(op1).submitPrice(70_000_000n);  // 0.7 USD
    await oracle.connect(op2).submitPrice(70_000_000n);
    await oracle.connect(op3).submitPrice(70_000_000n);

    expect(await usdw.isLiquidable(alice.address)).to.be.true;

    // Bob acquiert 30 USDW de Alice (tx interne, simplification)
    await usdw.connect(alice).transfer(bob.address, 30n * ONE);

    // Bob liquide la moitié de la dette d'Alice
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const tx = await usdw.connect(bob).liquidate(alice.address, 30n * ONE);
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const bobAfter = await ethers.provider.getBalance(bob.address);

    // Bob a reçu du collatéral (en WTG natif)
    expect(bobAfter - bobBefore + gas).to.be.gt(0n);
  });

  it("stability fee accumule sur la dette", async () => {
    const { usdw, alice, treasury } = await deployStablecoinFixture();
    await usdw.connect(alice).openOrIncrease(50n * ONE, { value: 100n * ONE });

    const initialDebt = (await usdw.positions(alice.address)).debt;

    // Avancer 1 an
    await time.increase(365 * 24 * 3600);

    const debtWithFees = await usdw.debtWithFees(alice.address);
    // 2% de 50 USDW = 1 USDW de fees
    expect(debtWithFees).to.be.closeTo(initialDebt + ONE, ONE / 10n);

    // Treasury devrait recevoir la moitié des fees au prochain accrue
    await usdw.connect(alice).repay(0n).catch(() => {});
    // ou via addCollateral qui trigger _accrueFees
    await usdw.connect(alice).addCollateral({ value: 1n * ONE });
    expect(await usdw.balanceOf(treasury.address)).to.be.gt(0n);
  });

  it("debt ceiling cap les mints", async () => {
    const [owner, alice, treasury, op1, op2, op3] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 86400, 9999);
    await oracle.setOperators([op1.address, op2.address, op3.address]);
    await oracle.connect(op1).submitPrice(1n * USD_8);
    await oracle.connect(op2).submitPrice(1n * USD_8);
    await oracle.connect(op3).submitPrice(1n * USD_8);

    const USDW = await ethers.getContractFactory("USDW");
    const usdw = await USDW.deploy(
      owner.address, await oracle.getAddress(), treasury.address, 200, 100n * ONE,  // ceiling 100 USDW
    );

    // Alice essaie de mint 101 USDW → revert
    await expect(
      usdw.connect(alice).openOrIncrease(101n * ONE, { value: 1000n * ONE }),
    ).to.be.revertedWithCustomError(usdw, "DebtCeilingHit");
  });

  it("setStabilityFee : revert si > MAX", async () => {
    const { usdw, owner } = await deployStablecoinFixture();
    const MAX = await usdw.MAX_STABILITY_FEE_BPS();
    await expect(usdw.connect(owner).setStabilityFee(MAX + 1n)).to.be.revertedWithCustomError(
      usdw,
      "StabilityFeeTooHigh",
    );
  });
});
