import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE = 10n ** 18n;

async function deployDexFixture() {
  const [owner, alice, bob, feeToSetter] = await ethers.getSigners();

  const WTG = await ethers.getContractFactory("WTGToken");
  const wwtg = await WTG.deploy();

  const Factory = await ethers.getContractFactory("WINTGFactory");
  const factory = await Factory.deploy(owner.address, feeToSetter.address);

  const Router = await ethers.getContractFactory("WINTGRouter");
  const router = await Router.deploy(await factory.getAddress(), await wwtg.getAddress());

  // Deux tokens ERC-20 pour tests : on déploie deux WTGTokens (utilisable comme ERC-20)
  // Pour des vrais tests, on aurait besoin de mock ERC-20. Simplification :
  // on utilise le wrapper pour générer du WWTG aux comptes, puis on l'utilise comme token A.
  // Pour token B, on déploie un second wrapper indépendant.
  const TokenB = await ethers.getContractFactory("WTGToken");
  const tokenB = await TokenB.deploy();

  // Approvisionner alice : 200 WWTG + 200 TokenB (assez pour les tests, pas trop)
  await wwtg.connect(alice).deposit({ value: 200n * ONE });
  await tokenB.connect(alice).deposit({ value: 200n * ONE });
  await wwtg.connect(bob).deposit({ value: 50n * ONE });

  return { factory, router, wwtg, tokenB, owner, alice, bob, feeToSetter };
}

describe("WINTGFactory", () => {
  it("createPair génère une nouvelle pair (ordre indifférent)", async () => {
    const { factory, wwtg, tokenB } = await deployDexFixture();
    await expect(factory.createPair(await wwtg.getAddress(), await tokenB.getAddress())).to.emit(
      factory,
      "PairCreated",
    );
    expect(await factory.allPairsLength()).to.equal(1n);
    // Doublon revert
    await expect(
      factory.createPair(await tokenB.getAddress(), await wwtg.getAddress()),
    ).to.be.revertedWithCustomError(factory, "PairExists");
  });

  it("rejette adresses identiques / zero", async () => {
    const { factory, wwtg } = await deployDexFixture();
    await expect(
      factory.createPair(await wwtg.getAddress(), await wwtg.getAddress()),
    ).to.be.revertedWithCustomError(factory, "IdenticalAddresses");
    await expect(
      factory.createPair(ethers.ZeroAddress, await wwtg.getAddress()),
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });

  it("setFeeTo / setFeeToSetter limités à feeToSetter", async () => {
    const { factory, owner, feeToSetter, alice } = await deployDexFixture();

    await expect(factory.connect(owner).setFeeTo(alice.address)).to.be.revertedWithCustomError(
      factory,
      "Forbidden",
    );

    await factory.connect(feeToSetter).setFeeTo(alice.address);
    expect(await factory.feeTo()).to.equal(alice.address);
  });
});

describe("WINTGRouter — addLiquidity / swap", () => {
  it("addLiquidity premier dépôt + swapExactTokensForTokens", async () => {
    const { factory, router, wwtg, tokenB, alice } = await deployDexFixture();
    const deadline = (await time.latest()) + 3600;

    // Approvals
    await wwtg.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
    await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

    // Add 100 WWTG / 100 TokenB
    await router.connect(alice).addLiquidity(
      await wwtg.getAddress(),
      await tokenB.getAddress(),
      100n * ONE, 100n * ONE,
      90n * ONE, 90n * ONE,
      alice.address, deadline,
    );

    // La pair existe maintenant
    const pairAddr = await factory.getPair(await wwtg.getAddress(), await tokenB.getAddress());
    expect(pairAddr).to.not.equal(ethers.ZeroAddress);

    // Swap 10 WWTG → TokenB
    const path = [await wwtg.getAddress(), await tokenB.getAddress()];
    const expectedOut = await router.getAmountsOut(10n * ONE, path);
    const balBefore = await tokenB.balanceOf(alice.address);
    await router.connect(alice).swapExactTokensForTokens(
      10n * ONE, 0n, path, alice.address, deadline,
    );
    const balAfter = await tokenB.balanceOf(alice.address);
    expect(balAfter - balBefore).to.equal(expectedOut[1]);
  });

  it("addLiquidityWTG + swapExactWTGForTokens (auto-wrap)", async () => {
    const { factory, router, wwtg, tokenB, alice, bob } = await deployDexFixture();
    const deadline = (await time.latest()) + 3600;

    await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

    // Add liquidity avec WTG natif (auto-wrap)
    await router.connect(alice).addLiquidityWTG(
      await tokenB.getAddress(),
      100n * ONE,
      90n * ONE,
      90n * ONE,
      alice.address,
      deadline,
      { value: 100n * ONE },
    );

    // Bob swap 1 WTG natif → TokenB
    const path = [await wwtg.getAddress(), await tokenB.getAddress()];
    const balBefore = await tokenB.balanceOf(bob.address);
    await router.connect(bob).swapExactWTGForTokens(
      0n, path, bob.address, deadline,
      { value: 1n * ONE },
    );
    const balAfter = await tokenB.balanceOf(bob.address);
    expect(balAfter - balBefore).to.be.gt(0n);
  });

  it("rejette deadline expirée", async () => {
    const { router, wwtg, tokenB, alice } = await deployDexFixture();
    await wwtg.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
    await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

    const expiredDeadline = (await time.latest()) - 100;
    await expect(
      router.connect(alice).addLiquidity(
        await wwtg.getAddress(), await tokenB.getAddress(),
        ONE, ONE, 0, 0, alice.address, expiredDeadline,
      ),
    ).to.be.revertedWithCustomError(router, "Expired");
  });

  it("getAmountOut : invariant constant-product", async () => {
    const { router } = await deployDexFixture();
    const reserveIn = 1000n * ONE;
    const reserveOut = 1000n * ONE;
    const amountIn = 100n * ONE;
    const out = await router.getAmountOut(amountIn, reserveIn, reserveOut);
    // À 0.3 % fee : out ≈ 90.66 WTG
    expect(out).to.be.gt(85n * ONE);
    expect(out).to.be.lt(95n * ONE);
  });
});
