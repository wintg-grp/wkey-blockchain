/**
 * Tests dédiés à pousser la couverture des branches/statements à 95%.
 * Vise les chemins moins courants des contrats principaux.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE = 10n ** 18n;
const NATIVE = "0x0000000000000000000000000000000000000000";

// =============================================================================
// WINTGRouter — paths peu testés
// =============================================================================
describe("Coverage — WINTGRouter", () => {
  async function setup() {
    const [owner, alice, feeSetter] = await ethers.getSigners();
    const WTG = await ethers.getContractFactory("WTGToken");
    const wwtg = await WTG.deploy();
    const tokenB = await WTG.deploy();
    const Factory = await ethers.getContractFactory("WINTGFactory");
    const factory = await Factory.deploy(owner.address, feeSetter.address);
    const Router = await ethers.getContractFactory("WINTGRouter");
    const router = await Router.deploy(await factory.getAddress(), await wwtg.getAddress());

    await wwtg.connect(alice).deposit({ value: 200n * ONE });
    await tokenB.connect(alice).deposit({ value: 200n * ONE });
    await wwtg.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
    await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

    const dl = (await time.latest()) + 3600;
    await router.connect(alice).addLiquidity(
      await wwtg.getAddress(), await tokenB.getAddress(),
      100n * ONE, 100n * ONE, 0, 0, alice.address, dl,
    );

    return { router, factory, wwtg, tokenB, owner, alice, feeSetter };
  }

  it("getAmountIn : compute backward", async () => {
    const { router } = await setup();
    const amountIn = await router.getAmountIn(50n * ONE, 1000n * ONE, 1000n * ONE);
    expect(amountIn).to.be.gt(0n);
  });

  it("quote helper", async () => {
    const { router } = await setup();
    const out = await router.quote(100n * ONE, 1000n * ONE, 2000n * ONE);
    expect(out).to.equal(200n * ONE);
  });

  it("swapTokensForExactTokens", async () => {
    const { router, wwtg, tokenB, alice } = await setup();
    const dl = (await time.latest()) + 3600;
    await router.connect(alice).swapTokensForExactTokens(
      ONE / 10n,                  // 0.1 tokenB out exactly
      ONE,                         // max 1 wwtg in
      [await wwtg.getAddress(), await tokenB.getAddress()],
      alice.address, dl,
    );
  });

  it("swapExactTokensForWTG (auto-unwrap)", async () => {
    const { router, wwtg, tokenB, alice } = await setup();
    const dl = (await time.latest()) + 3600;
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await router.connect(alice).swapExactTokensForWTG(
      ONE, 0n,
      [await tokenB.getAddress(), await wwtg.getAddress()],
      alice.address, dl,
    );
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.be.gt(0n);
  });

  it("swapWTGForExactTokens", async () => {
    const { router, wwtg, tokenB, alice } = await setup();
    const dl = (await time.latest()) + 3600;
    await router.connect(alice).swapWTGForExactTokens(
      ONE / 100n,
      [await wwtg.getAddress(), await tokenB.getAddress()],
      alice.address, dl,
      { value: ONE },
    );
  });

  it("removeLiquidity", async () => {
    const { router, factory, wwtg, tokenB, alice } = await setup();
    const dl = (await time.latest()) + 3600;
    const pairAddr = await factory.getPair(await wwtg.getAddress(), await tokenB.getAddress());
    const pair = await ethers.getContractAt("WINTGPair", pairAddr);
    const liquidity = await pair.balanceOf(alice.address);
    await pair.connect(alice).approve(await router.getAddress(), liquidity);
    await router.connect(alice).removeLiquidity(
      await wwtg.getAddress(), await tokenB.getAddress(),
      liquidity / 2n, 0, 0, alice.address, dl,
    );
  });

  it("removeLiquidityWTG", async () => {
    // Setup propre indépendant
    const [owner, alice2, feeSetter] = await ethers.getSigners();
    const WTG = await ethers.getContractFactory("WTGToken");
    const wwtg = await WTG.deploy();
    const tokenB = await WTG.deploy();
    const Factory = await ethers.getContractFactory("WINTGFactory");
    const factory = await Factory.deploy(owner.address, feeSetter.address);
    const Router = await ethers.getContractFactory("WINTGRouter");
    const router = await Router.deploy(await factory.getAddress(), await wwtg.getAddress());

    await tokenB.connect(alice2).deposit({ value: 100n * ONE });
    await tokenB.connect(alice2).approve(await router.getAddress(), ethers.MaxUint256);

    const dl = (await time.latest()) + 3600;
    await router.connect(alice2).addLiquidityWTG(
      await tokenB.getAddress(), 50n * ONE, 0, 0, alice2.address, dl, { value: 50n * ONE },
    );

    const pairAddr = await factory.getPair(await tokenB.getAddress(), await wwtg.getAddress());
    const pair = await ethers.getContractAt("WINTGPair", pairAddr);
    const liquidity = await pair.balanceOf(alice2.address);
    await pair.connect(alice2).approve(await router.getAddress(), liquidity);
    await router.connect(alice2).removeLiquidityWTG(
      await tokenB.getAddress(), liquidity / 2n, 0, 0, alice2.address, dl,
    );
  });

  it("expired deadline reverts", async () => {
    const { router, wwtg, tokenB, alice } = await setup();
    const past = (await time.latest()) - 100;
    await expect(router.connect(alice).swapExactTokensForTokens(
      ONE, 0, [await wwtg.getAddress(), await tokenB.getAddress()], alice.address, past,
    )).to.be.revertedWithCustomError(router, "Expired");
  });
});

// =============================================================================
// WINTGPair — skim, sync, mintFee
// =============================================================================
describe("Coverage — WINTGPair", () => {
  it("skim/sync après envoi direct au pair", async () => {
    const [owner, alice, feeSetter] = await ethers.getSigners();
    const WTG = await ethers.getContractFactory("WTGToken");
    const wwtg = await WTG.deploy();
    const tokenB = await WTG.deploy();
    const Factory = await ethers.getContractFactory("WINTGFactory");
    const factory = await Factory.deploy(owner.address, feeSetter.address);
    await factory.createPair(await wwtg.getAddress(), await tokenB.getAddress());
    const pairAddr = await factory.getPair(await wwtg.getAddress(), await tokenB.getAddress());
    const pair = await ethers.getContractAt("WINTGPair", pairAddr);

    await wwtg.connect(alice).deposit({ value: 50n * ONE });
    await wwtg.connect(alice).transfer(pairAddr, ONE);

    await pair.connect(alice).sync();
    await pair.connect(alice).skim(alice.address);
  });
});

// =============================================================================
// WINTGBridge — pause + setRelayers + dailyLimit
// =============================================================================
describe("Coverage — WINTGBridge", () => {
  it("setRelayers + pause/unpause", async () => {
    const [owner, r1, r2, r3, newR] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("WINTGBridge");
    const bridge = await Bridge.deploy(owner.address, [r1.address, r2.address, r3.address], 2);

    await bridge.connect(owner).pause();
    await expect(
      bridge.connect(r1).lock(56, r1.address, { value: ONE }),
    ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    await bridge.connect(owner).unpause();

    // Rotate relayers
    await bridge.connect(owner).setRelayers([newR.address, r1.address], 1);
    expect(await bridge.relayersCount()).to.equal(2n);
    expect(await bridge.threshold()).to.equal(1n);
    expect(await bridge.dailyLimit()).to.equal(0n);  // totalLocked = 0

    // Bad config
    await expect(
      bridge.connect(owner).setRelayers([newR.address], 0),
    ).to.be.revertedWithCustomError(bridge, "InvalidThreshold");
    await expect(
      bridge.connect(owner).setRelayers([ethers.ZeroAddress], 1),
    ).to.be.revertedWithCustomError(bridge, "ZeroAddress");
  });
});

// =============================================================================
// OracleAggregator — getRoundData + setMaxPriceAge / setMaxDeviationBps
// =============================================================================
describe("Coverage — OracleAggregator", () => {
  it("getRoundData + setters", async () => {
    const [owner, op1, op2, op3] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const o = await Oracle.deploy(owner.address, 8, "X/USD", 600, 5000);
    await o.setOperators([op1.address, op2.address, op3.address]);
    await o.connect(op1).submitPrice(100n * 10n ** 8n);
    await o.connect(op2).submitPrice(102n * 10n ** 8n);
    await o.connect(op3).submitPrice(98n * 10n ** 8n);

    const round = await o.getRoundData(1);
    expect(round[1]).to.be.gt(0n);

    await o.connect(owner).setMaxPriceAge(120);
    await o.connect(owner).setMaxDeviationBps(1000);
    expect(await o.operatorsCount()).to.equal(3n);
  });

  it("submitPrice avec prix <= 0 revert", async () => {
    const [owner, op1] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const o = await Oracle.deploy(owner.address, 8, "X/USD", 600, 5000);
    await o.setOperators([op1.address]);
    await expect(o.connect(op1).submitPrice(0)).to.be.revertedWithCustomError(o, "InvalidPrice");
  });
});

// =============================================================================
// Multicall3 — variantes peu testées
// =============================================================================
describe("Coverage — Multicall3", () => {
  it("tryAggregate + blockAndAggregate + getCurrentBlockTimestamp/Coinbase/GasLimit/Basefee/LastBlockHash", async () => {
    const Multi = await ethers.getContractFactory("Multicall3");
    const m = await Multi.deploy();

    const calls = [{ target: await m.getAddress(), callData: m.interface.encodeFunctionData("getBlockNumber") }];
    await m.tryAggregate.staticCall(false, calls);
    await m.blockAndAggregate.staticCall(calls);

    expect(await m.getCurrentBlockTimestamp()).to.be.gt(0n);
    expect(await m.getCurrentBlockGasLimit()).to.be.gt(0n);
    expect(await m.getCurrentBlockCoinbase()).to.not.equal(ethers.ZeroAddress);
    await m.getLastBlockHash();
    await m.getBasefee();
  });

  it("aggregate3Value avec value matching", async () => {
    const Multi = await ethers.getContractFactory("Multicall3");
    const m = await Multi.deploy();
    // Just call getBlockNumber with 0 value — exercises the path
    const calls = [{ target: await m.getAddress(), allowFailure: false, value: 0n,
                     callData: m.interface.encodeFunctionData("getBlockNumber") }];
    await m.aggregate3Value(calls, { value: 0 });
  });
});

// =============================================================================
// AirdropVesting — recoverUnclaimed + pause flow
// =============================================================================
describe("Coverage — AirdropVesting", () => {
  it("vestedAmount avant start retourne 0 ; recoverUnclaimed après fenêtre", async () => {
    const { StandardMerkleTree } = await import("@openzeppelin/merkle-tree");
    const [owner, alice, treasury] = await ethers.getSigners();
    const tree = StandardMerkleTree.of([[alice.address, ONE]], ["address", "uint256"]);
    const Factory = await ethers.getContractFactory("AirdropVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, ONE);
    await owner.sendTransaction({ to: await c.getAddress(), value: ONE });

    expect(await c.vestedAmount(alice.address)).to.equal(0n);
    expect(await c.getReleasable(alice.address)).to.equal(0n);

    // Avancer après linear + 12 mois
    await time.increaseTo(start + 365n * 86400n + 365n * 86400n + 1n);
    await c.connect(owner).recoverUnclaimed(treasury.address);
  });

  it("pause bloque claim et release", async () => {
    const { StandardMerkleTree } = await import("@openzeppelin/merkle-tree");
    const [owner, alice] = await ethers.getSigners();
    const tree = StandardMerkleTree.of([[alice.address, ONE]], ["address", "uint256"]);
    const Factory = await ethers.getContractFactory("AirdropVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, ONE);
    await owner.sendTransaction({ to: await c.getAddress(), value: ONE });
    await c.connect(owner).pause();

    const proof = tree.getProof([alice.address, ONE]) as `0x${string}`[];
    await expect(c.connect(alice).claim(ONE, proof)).to.be.revertedWithCustomError(c, "EnforcedPause");
    await c.connect(owner).unpause();
  });

  it("constructor revert si root zero", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AirdropVesting");
    await expect(
      Factory.deploy(owner.address, "0x" + "00".repeat(32), 0, ONE),
    ).to.be.revertedWithCustomError(Factory, "ZeroMerkleRoot");
  });
});

// =============================================================================
// SaleVestingBase — branches edge cases
// =============================================================================
describe("Coverage — SaleVesting branches", () => {
  it("vestedAmount avant start = 0", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 1000n;
    const c = await Factory.deploy(owner.address, start, 100n * ONE);
    expect(await c.vestedAmount(ethers.ZeroAddress)).to.equal(0n);
  });

  it("Length mismatch dans setAllocations", async () => {
    const [owner, b1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const c = await Factory.deploy(owner.address, BigInt(await time.latest()) + 100n, 100n * ONE);
    await expect(
      c.connect(owner).setAllocations([b1.address], [ONE, 2n * ONE]),
    ).to.be.revertedWithCustomError(c, "LengthMismatch");
  });

  it("ZeroCap au constructor", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    await expect(
      Factory.deploy(owner.address, BigInt(await time.latest()) + 100n, 0),
    ).to.be.revertedWithCustomError(Factory, "ZeroCap");
  });

  it("release avant finalize revert", async () => {
    const [owner, b1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const c = await Factory.deploy(owner.address, BigInt(await time.latest()) + 100n, 100n * ONE);
    await c.connect(owner).setAllocations([b1.address], [ONE]);
    await expect(c.connect(b1).release()).to.be.revertedWithCustomError(c, "NotFinalized");
  });

  it("release no allocation revert", async () => {
    const [owner, b1, b2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, start, 100n * ONE);
    await c.connect(owner).setAllocations([b1.address], [ONE]);
    await c.connect(owner).finalize();
    await time.increaseTo(start);
    await expect(c.connect(b2).release()).to.be.revertedWithCustomError(c, "NoAllocation");
  });

  it("pause/unpause", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PublicSaleVesting");
    const c = await Factory.deploy(owner.address, BigInt(await time.latest()) + 100n, 100n * ONE);
    await c.connect(owner).pause();
    await c.connect(owner).unpause();
  });
});

// =============================================================================
// VestingVault — end() view
// =============================================================================
describe("Coverage — VestingVault.end()", () => {
  it("end = start + cliff + linearDuration", async () => {
    const [owner, ben] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("VestingVault");
    const v = await Factory.deploy(
      owner.address, ben.address, 1000n, 100n, 200n, 0, 1000n * ONE, false,
    );
    expect(await v.end()).to.equal(1300n);
  });
});

// =============================================================================
// FeeDistributor branches
// =============================================================================
describe("Coverage — FeeDistributor.pendingDistribution", () => {
  it("pendingDistribution view", async () => {
    const [owner, t, v] = await ethers.getSigners();
    const Burn = await ethers.getContractFactory("BurnContract");
    const burn = await Burn.deploy();
    const Distrib = await ethers.getContractFactory("FeeDistributor");
    const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress());
    expect(await d.pendingDistribution()).to.equal(0n);
  });
});

// =============================================================================
// WINTGNFT branches
// =============================================================================
describe("Coverage — WINTGNFT", () => {
  it("supportsInterface", async () => {
    const [admin] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("X", "X", admin.address, admin.address, 0);
    // ERC721, ERC2981, AccessControl
    expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;  // ERC721
    expect(await nft.supportsInterface("0x2a55205a")).to.be.true;  // ERC2981
  });

  it("setDefaultRoyalty + setTokenRoyalty", async () => {
    const [admin, alice] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("X", "X", admin.address, admin.address, 100);
    await nft.connect(admin).mint(alice.address, "x");
    await nft.connect(admin).setDefaultRoyalty(alice.address, 200);
    await nft.connect(admin).setTokenRoyalty(1, alice.address, 300);
    const [, amt] = await nft.royaltyInfo(1, 100_000);
    expect(amt).to.equal(3000n);
  });
});

// =============================================================================
// WINTGCollection branches
// =============================================================================
describe("Coverage — WINTGCollection", () => {
  it("setURI + supportsInterface + pause", async () => {
    const [admin, alice] = await ethers.getSigners();
    const C = await ethers.getContractFactory("WINTGCollection");
    const c = await C.deploy("X", "X", "ipfs://x", admin.address, admin.address, 0);
    await c.connect(admin).setURI("ipfs://new");
    expect(await c.supportsInterface("0xd9b67a26")).to.be.true;  // ERC1155
    await c.connect(admin).pause();
    await expect(c.connect(admin).mint(alice.address, 1, 1, "0x")).to.be.revertedWithCustomError(c, "EnforcedPause");
    await c.connect(admin).unpause();
  });
});

// =============================================================================
// StakingRewardsReserve — pause + edge cases
// =============================================================================
describe("Coverage — StakingRewardsReserve", () => {
  it("FundsReceived event + amounts views", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("StakingRewardsReserve");
    const c = await Factory.deploy(owner.address, 1000n * ONE);
    await expect(owner.sendTransaction({ to: await c.getAddress(), value: ONE }))
      .to.emit(c, "FundsReceived");
  });
});

// =============================================================================
// WINTGTreasury — getter + edge
// =============================================================================
describe("Coverage — WINTGTreasury", () => {
  it("Deposited event + getTransaction views", async () => {
    const [s1, s2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address], 1);
    await expect(s1.sendTransaction({ to: await m.getAddress(), value: ONE }))
      .to.emit(m, "Deposited");
  });
});
