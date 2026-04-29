/**
 * Batch 8 — DeFi Bootstrap (Pre-DEX) — smoke tests.
 * Covers: PriceAdmin, LiquidityReserveVault, SubscriptionPayment, Faucet, USDWVault, WCFAVault.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("Batch 8 — DeFi bootstrap", () => {
  let owner: Signer, treasury: Signer, alice: Signer, bob: Signer, signer: Signer;
  let wtg: any, wkey: any, usdw: any, wcfa: any;

  beforeEach(async () => {
    [owner, treasury, alice, bob, signer] = await ethers.getSigners();
    const ERC = await ethers.getContractFactory("MockERC20");
    wtg  = await ERC.deploy(); // simulating WTG (mock)
    wkey = await ERC.deploy();
    usdw = await ERC.deploy();
    wcfa = await ERC.deploy();
  });

  /* --------------------------- PriceAdmin --------------------------- */

  it("WintgPriceAdmin: set + convert CFA <-> token", async () => {
    const PA = await ethers.getContractFactory("WintgPriceAdmin");
    const pa = await PA.deploy(await owner.getAddress());

    // 1 WTG = 50 CFA → 50 × 10_000 = 500_000
    await pa.connect(owner).setPrice(await wtg.getAddress(), 500_000);
    expect(await pa.priceCFA(await wtg.getAddress())).to.equal(500_000n);

    // 9000 CFA → tokens : 9000 / 50 = 180 WTG = 180e18
    const tokenAmount = await pa.convertCfaToToken(await wtg.getAddress(), 9000);
    expect(tokenAmount).to.equal(ethers.parseEther("180"));

    // 180e18 WTG → CFA : 180 × 50 = 9000
    const cfa = await pa.convertTokenToCfa(await wtg.getAddress(), ethers.parseEther("180"));
    expect(cfa).to.equal(9000n);
  });

  it("WintgPriceAdmin: setPriceBatch", async () => {
    const PA = await ethers.getContractFactory("WintgPriceAdmin");
    const pa = await PA.deploy(await owner.getAddress());
    await pa.connect(owner).setPriceBatch(
      [await wtg.getAddress(), await wkey.getAddress()],
      [500_000, 200_000], // 50 CFA, 20 CFA
    );
    expect(await pa.priceCFA(await wtg.getAddress())).to.equal(500_000n);
    expect(await pa.priceCFA(await wkey.getAddress())).to.equal(200_000n);
  });

  /* --------------------------- LiquidityReserveVault --------------------------- */

  it("LiquidityReserveVault: deposit + release flow", async () => {
    const LRV = await ethers.getContractFactory("LiquidityReserveVault");
    const vault = await LRV.deploy(await owner.getAddress());

    await wtg.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await wtg.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(alice).deposit(await wtg.getAddress(), ethers.parseEther("500"));

    expect(await vault.balanceOf(await wtg.getAddress())).to.equal(ethers.parseEther("500"));
    expect(await vault.lifetimeReceived(await wtg.getAddress())).to.equal(ethers.parseEther("500"));

    // Owner releases to a fake pool (= bob)
    await vault.connect(owner).releaseToLiquidity(await wtg.getAddress(), await bob.getAddress(), ethers.parseEther("300"));
    expect(await wtg.balanceOf(await bob.getAddress())).to.equal(ethers.parseEther("300"));
    expect(await vault.lifetimeReleased(await wtg.getAddress())).to.equal(ethers.parseEther("300"));
  });

  /* --------------------------- SubscriptionPayment --------------------------- */

  it("SubscriptionPayment: pay with discount + reserve receives", async () => {
    const PA = await ethers.getContractFactory("WintgPriceAdmin");
    const pa = await PA.deploy(await owner.getAddress());
    await pa.connect(owner).setPrice(await wtg.getAddress(), 500_000); // 50 CFA

    const LRV = await ethers.getContractFactory("LiquidityReserveVault");
    const reserve = await LRV.deploy(await owner.getAddress());

    const SP = await ethers.getContractFactory("SubscriptionPayment");
    const sub = await SP.deploy(await owner.getAddress(), await pa.getAddress(), await reserve.getAddress());

    // Plan: 10 000 CFA / 30 days / 10% discount
    const planId = ethers.id("PREMIUM_MONTHLY");
    await sub.connect(owner).createPlan(planId, "Premium", 10000, 30 * 86400, 1000);
    await sub.connect(owner).setAcceptedToken(await wtg.getAddress(), true);

    // Quote
    const [tokenAmt, cfaEq] = await sub.quote(planId, await wtg.getAddress());
    expect(cfaEq).to.equal(9000n); // 10 000 - 10%
    expect(tokenAmt).to.equal(ethers.parseEther("180")); // 9000 / 50

    // Alice pays
    await wtg.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await wtg.connect(alice).approve(await sub.getAddress(), ethers.parseEther("180"));
    await sub.connect(alice).paySubscription(planId, await wtg.getAddress());

    // Reserve received the 180 WTG
    expect(await wtg.balanceOf(await reserve.getAddress())).to.equal(ethers.parseEther("180"));
    // Alice is subscribed
    expect(await sub.isSubscribed(await alice.getAddress(), planId)).to.equal(true);
  });

  it("SubscriptionPayment: pay extends subscription", async () => {
    const PA = await ethers.getContractFactory("WintgPriceAdmin");
    const pa = await PA.deploy(await owner.getAddress());
    await pa.connect(owner).setPrice(await wtg.getAddress(), 500_000);
    const LRV = await ethers.getContractFactory("LiquidityReserveVault");
    const reserve = await LRV.deploy(await owner.getAddress());
    const SP = await ethers.getContractFactory("SubscriptionPayment");
    const sub = await SP.deploy(await owner.getAddress(), await pa.getAddress(), await reserve.getAddress());
    const planId = ethers.id("BASIC");
    await sub.connect(owner).createPlan(planId, "Basic", 1000, 86400, 0); // 1000 CFA, 1 day, no discount
    await sub.connect(owner).setAcceptedToken(await wtg.getAddress(), true);

    await wtg.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await wtg.connect(alice).approve(await sub.getAddress(), ethers.parseEther("1000"));
    await sub.connect(alice).paySubscription(planId, await wtg.getAddress());
    const e1 = await sub.subscriptionExpiresAt(await alice.getAddress(), planId);
    await sub.connect(alice).paySubscription(planId, await wtg.getAddress());
    const e2 = await sub.subscriptionExpiresAt(await alice.getAddress(), planId);
    expect(e2).to.be.gt(e1);
    expect(e2 - e1).to.equal(86400n);
  });

  /* --------------------------- WintgFaucet --------------------------- */

  it("WintgFaucet: claim with valid signature", async () => {
    const F = await ethers.getContractFactory("WintgFaucet");
    const fct = await F.deploy(await owner.getAddress(), await signer.getAddress());

    // Configure WTG drip: 100 WTG / claim, 1 day cooldown
    await fct.connect(owner).setDrip(await wtg.getAddress(), ethers.parseEther("100"), 86400, true);

    // Topup faucet with 500 WTG
    await wtg.transfer(await fct.getAddress(), ethers.parseEther("500"));

    // Build signed message
    const nonce = ethers.id("nonce-1");
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const network = await ethers.provider.getNetwork();
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "address", "address", "address", "uint256", "bytes32", "uint64"],
        ["WINTG-FAUCET", network.chainId, await fct.getAddress(), await alice.getAddress(),
         await wtg.getAddress(), ethers.parseEther("100"), nonce, deadline]
      )
    );
    const sig = await signer.signMessage(ethers.getBytes(messageHash));

    const beforeBal = await wtg.balanceOf(await alice.getAddress());
    await fct.connect(alice).claim(await wtg.getAddress(), ethers.parseEther("100"), nonce, deadline, sig);
    const afterBal = await wtg.balanceOf(await alice.getAddress());
    expect(afterBal - beforeBal).to.equal(ethers.parseEther("100"));

    // Replay = nonce used
    await expect(
      fct.connect(alice).claim(await wtg.getAddress(), ethers.parseEther("100"), nonce, deadline, sig)
    ).to.be.revertedWithCustomError(fct, "NonceUsed");
  });

  /* --------------------------- USDWVault --------------------------- */

  it("USDWVault: deposit + mint + repay + withdraw", async () => {
    const PA = await ethers.getContractFactory("WintgPriceAdmin");
    const pa = await PA.deploy(await owner.getAddress());
    // Prices: 1 WTG = 50 CFA, 1 USDW = 600 CFA
    await pa.connect(owner).setPrice(await wtg.getAddress(), 500_000);
    await pa.connect(owner).setPrice(await usdw.getAddress(), 6_000_000);

    // We use the mock ERC20 as USDW too (no real mint, we transfer in/out)
    // For real Vault testing, USDW would need MINTER_ROLE — here we stub.
    const StubMintBurn = await ethers.getContractFactory("MockMintBurnToken");
    const usdwMint = await StubMintBurn.deploy("USDW", "USDW");
    await pa.connect(owner).setPrice(await usdwMint.getAddress(), 6_000_000);

    const Vault = await ethers.getContractFactory("USDWVault");
    const vault = await Vault.deploy(
      await owner.getAddress(),
      await wtg.getAddress(),
      await usdwMint.getAddress(),
      await pa.getAddress(),
      await treasury.getAddress(),
      ethers.parseEther("1000000")
    );

    // Give vault the mint role (in our stub it's open)
    await usdwMint.connect(owner).setMinter(await vault.getAddress(), true);

    // Alice has 1000 WTG (= 50000 CFA = ~83.3 USD = 50 USDW worth)
    await wtg.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await wtg.connect(alice).approve(await vault.getAddress(), ethers.parseEther("1000"));

    // Alice deposits 1000 WTG (= 50 000 CFA collat)
    await vault.connect(alice).deposit(ethers.parseEther("1000"));
    // Mint USDW : avec 50000 CFA collat, ratio min 150% → max debt = 33 333 CFA = ~55 USDW
    // Try minting 50 USDW (30000 CFA debt) → ratio = 50000/30000 = 166.6% ✅
    await vault.connect(alice).mintUSDW(ethers.parseEther("50"));
    expect(await usdwMint.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("50"));

    // Try mintUSDW 100 → ratio 50000 / 60000 = 83% ❌
    await expect(vault.connect(alice).mintUSDW(ethers.parseEther("100"))).to.be.revertedWithCustomError(vault, "CollateralRatioTooLow");

    // Repay 50 USDW
    await usdwMint.connect(alice).approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.connect(alice).repay(ethers.parseEther("50"));

    // Withdraw 1000 WTG (no debt now)
    await vault.connect(alice).withdraw(ethers.parseEther("1000"));
    expect(await wtg.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("1000"));
  });
});
