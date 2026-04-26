import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE = 10n ** 18n;
const USD_8 = 10n ** 8n;
const NATIVE = "0x0000000000000000000000000000000000000000";

beforeEach(async () => {
  await network.provider.send("hardhat_reset");
});

async function deployLendingFixture() {
  const [owner, alice, bob, treasury, op1, op2, op3] = await ethers.getSigners();

  // Oracle WTG/USD
  const Oracle = await ethers.getContractFactory("OracleAggregator");
  const wtgOracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 86400, 9999);
  await wtgOracle.setOperators([op1.address, op2.address, op3.address]);
  await wtgOracle.connect(op1).submitPrice(1n * USD_8);
  await wtgOracle.connect(op2).submitPrice(1n * USD_8);
  await wtgOracle.connect(op3).submitPrice(1n * USD_8);

  // Oracle USDW/USD = 1$ fixe
  const usdwOracle = await Oracle.deploy(owner.address, 8, "USDW/USD", 86400, 9999);
  await usdwOracle.setOperators([op1.address, op2.address, op3.address]);
  await usdwOracle.connect(op1).submitPrice(1n * USD_8);
  await usdwOracle.connect(op2).submitPrice(1n * USD_8);
  await usdwOracle.connect(op3).submitPrice(1n * USD_8);

  // USDW
  const USDW = await ethers.getContractFactory("USDW");
  const usdw = await USDW.deploy(
    owner.address, await wtgOracle.getAddress(), treasury.address,
    200, 1_000_000n * ONE,
  );

  // LendingPool
  const Pool = await ethers.getContractFactory("LendingPool");
  const pool = await Pool.deploy(owner.address, treasury.address);

  // Add WTG natif comme collatéral seulement
  await pool.addReserve(
    NATIVE, true, await wtgOracle.getAddress(),
    7500, 8000, 1000,                  // LTV 75 %, LiqThr 80 %, ReserveFactor 10 %
    0, 400, 6000, 8000,                // baseRate 0, slope1 4 %, slope2 60 %, kink 80 %
    true, false,                       // collat OK, borrow NO
  );
  // Add USDW pour borrow + collat
  await pool.addReserve(
    await usdw.getAddress(), false, await usdwOracle.getAddress(),
    8500, 9000, 1000,                  // LTV 85 %, LiqThr 90 % (stablecoin)
    0, 400, 6000, 8000,
    true, true,                        // collat ET borrow OK
  );

  // Alice ouvre une position USDW : lock 200 WTG, mint 100 USDW (pour fournir liquidity au pool)
  await usdw.connect(alice).openOrIncrease(100n * ONE, { value: 200n * ONE });

  return { pool, usdw, wtgOracle, usdwOracle, owner, alice, bob, treasury, op1, op2, op3 };
}

describe("LendingPool", () => {
  it("addReserve duplique revert", async () => {
    const { pool, usdw, wtgOracle } = await deployLendingFixture();
    await expect(
      pool.addReserve(
        NATIVE, true, await wtgOracle.getAddress(),
        7500, 8000, 1000, 0, 400, 6000, 8000, true, false,
      ),
    ).to.be.revertedWithCustomError(pool, "AssetAlreadyExists");
  });

  it("supply WTG natif", async () => {
    const { pool, alice } = await deployLendingFixture();
    await pool.connect(alice).supply(NATIVE, 50n * ONE, { value: 50n * ONE });
    const reserve = await pool.reserves(NATIVE);
    expect(reserve.totalSupply).to.equal(50n * ONE);
  });

  it("supply USDW (ERC-20)", async () => {
    const { pool, usdw, alice } = await deployLendingFixture();
    await usdw.connect(alice).approve(await pool.getAddress(), 50n * ONE);
    await pool.connect(alice).supply(await usdw.getAddress(), 50n * ONE);
    const reserve = await pool.reserves(await usdw.getAddress());
    expect(reserve.totalSupply).to.equal(50n * ONE);
  });

  it("supply native sans value revert", async () => {
    const { pool, alice } = await deployLendingFixture();
    await expect(
      pool.connect(alice).supply(NATIVE, 50n * ONE),
    ).to.be.revertedWithCustomError(pool, "MismatchedNativeValue");
  });

  it("borrow scenario complet : alice supply WTG, bob supply USDW, alice emprunte USDW", async () => {
    const { pool, usdw, alice, bob } = await deployLendingFixture();

    // Bob fournit 80 USDW au pool (depuis ses 100 USDW reçus de Alice via openOrIncrease... mais Alice les a)
    await usdw.connect(alice).transfer(bob.address, 80n * ONE);
    await usdw.connect(bob).approve(await pool.getAddress(), 80n * ONE);
    await pool.connect(bob).supply(await usdw.getAddress(), 80n * ONE);

    // Alice supply 100 WTG comme collatéral
    await pool.connect(alice).supply(NATIVE, 100n * ONE, { value: 100n * ONE });

    // Alice emprunte 50 USDW (LTV 50%, sain)
    const usdwBefore = await usdw.balanceOf(alice.address);
    await pool.connect(alice).borrow(await usdw.getAddress(), 50n * ONE);
    const usdwAfter = await usdw.balanceOf(alice.address);
    expect(usdwAfter - usdwBefore).to.equal(50n * ONE);

    // Health factor sain
    const hf = await pool.healthFactor(alice.address);
    expect(hf).to.be.gt(ONE);  // > 1.0
  });

  it("borrow revert si HF tomberait < 1", async () => {
    const { pool, usdw, alice, bob } = await deployLendingFixture();
    await usdw.connect(alice).transfer(bob.address, 80n * ONE);
    await usdw.connect(bob).approve(await pool.getAddress(), 80n * ONE);
    await pool.connect(bob).supply(await usdw.getAddress(), 80n * ONE);

    await pool.connect(alice).supply(NATIVE, 10n * ONE, { value: 10n * ONE });
    // Alice essaie d'emprunter 50 USDW contre seulement 10 WTG (LTV 500%)
    await expect(
      pool.connect(alice).borrow(await usdw.getAddress(), 50n * ONE),
    ).to.be.revertedWithCustomError(pool, "HealthFactorTooLow");
  });

  it("repay réduit la dette", async () => {
    const { pool, usdw, alice, bob } = await deployLendingFixture();
    await usdw.connect(alice).transfer(bob.address, 80n * ONE);
    await usdw.connect(bob).approve(await pool.getAddress(), 80n * ONE);
    await pool.connect(bob).supply(await usdw.getAddress(), 80n * ONE);

    await pool.connect(alice).supply(NATIVE, 100n * ONE, { value: 100n * ONE });
    await pool.connect(alice).borrow(await usdw.getAddress(), 30n * ONE);

    await usdw.connect(alice).approve(await pool.getAddress(), 10n * ONE);
    await pool.connect(alice).repay(await usdw.getAddress(), 10n * ONE);

    const debt = await pool.userBorrow(alice.address, await usdw.getAddress());
    expect(debt).to.be.lte(20n * ONE);
  });

  it("withdraw OK si pas de dette", async () => {
    const { pool, alice } = await deployLendingFixture();
    await pool.connect(alice).supply(NATIVE, 50n * ONE, { value: 50n * ONE });
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await pool.connect(alice).withdraw(NATIVE, 30n * ONE);
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.equal(30n * ONE);
  });

  it("supply 0 revert", async () => {
    const { pool, alice } = await deployLendingFixture();
    await expect(
      pool.connect(alice).supply(NATIVE, 0n, { value: 0n }),
    ).to.be.revertedWithCustomError(pool, "ZeroAmount");
  });

  it("borrow disabled asset revert", async () => {
    const { pool, alice, bob } = await deployLendingFixture();
    await pool.connect(alice).supply(NATIVE, 100n * ONE, { value: 100n * ONE });
    // WTG natif n'est pas borrow-enabled dans la fixture
    await expect(
      pool.connect(bob).borrow(NATIVE, 1n * ONE),
    ).to.be.revertedWithCustomError(pool, "BorrowDisabled");
  });

  it("ratesBps retourne supply/borrow APYs", async () => {
    const { pool, usdw, alice, bob } = await deployLendingFixture();
    await usdw.connect(alice).transfer(bob.address, 80n * ONE);
    await usdw.connect(bob).approve(await pool.getAddress(), 80n * ONE);
    await pool.connect(bob).supply(await usdw.getAddress(), 80n * ONE);

    await pool.connect(alice).supply(NATIVE, 100n * ONE, { value: 100n * ONE });
    await pool.connect(alice).borrow(await usdw.getAddress(), 50n * ONE);

    const [supplyApy, borrowApy] = await pool.ratesBps(await usdw.getAddress());
    // Avec 50/80 = 62.5% utilisation, sous le kink 80%, borrowApy = 0 + 62.5% × 4% = 2.5%
    expect(borrowApy).to.be.gt(0n);
    expect(supplyApy).to.be.gt(0n);
    expect(supplyApy).to.be.lt(borrowApy);
  });

  it("getReserveCount + utilization views", async () => {
    const { pool } = await deployLendingFixture();
    expect(await pool.getReserveCount()).to.equal(2n);
    expect(await pool.utilization(NATIVE)).to.equal(0n);
  });
});
