import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("OracleAggregator", () => {
  it("calcule la médiane sur 3 opérateurs", async () => {
    const [owner, op1, op2, op3] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 600, 5000); // 5% deviation max

    await oracle.connect(owner).setOperators([op1.address, op2.address, op3.address]);

    // Trois opérateurs poussent ; le 3e provoque le calcul de la médiane
    await oracle.connect(op1).submitPrice(100n * 10n ** 8n);
    await oracle.connect(op2).submitPrice(102n * 10n ** 8n);
    await oracle.connect(op3).submitPrice(98n * 10n ** 8n);

    const round = await oracle.latestRoundData();
    expect(round.answer).to.equal(100n * 10n ** 8n); // médiane
    expect(round.roundId).to.be.gt(0n);
  });

  it("rejette opérateur non-autorisé", async () => {
    const [owner, op1, stranger] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 600, 5000);
    await oracle.setOperators([op1.address]);

    await expect(oracle.connect(stranger).submitPrice(100n)).to.be.revertedWithCustomError(
      oracle,
      "NotOperator",
    );
  });

  it("rejette prix avec déviation > maxDeviationBps", async () => {
    const [owner, op1, op2, op3] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 600, 1000); // 10%
    await oracle.setOperators([op1.address, op2.address, op3.address]);

    await oracle.connect(op1).submitPrice(100n * 10n ** 8n);
    await oracle.connect(op2).submitPrice(101n * 10n ** 8n);
    await oracle.connect(op3).submitPrice(99n * 10n ** 8n);

    // Médiane = 100. Push 200 → 100% déviation, rejeté
    await expect(oracle.connect(op1).submitPrice(200n * 10n ** 8n)).to.be.revertedWithCustomError(
      oracle,
      "DeviationTooHigh",
    );
  });

  it("latestRoundData revert si stale", async () => {
    const [owner, op1, op2, op3] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("OracleAggregator");
    const oracle = await Oracle.deploy(owner.address, 8, "WTG/USD", 60, 5000);
    await oracle.setOperators([op1.address, op2.address, op3.address]);
    await oracle.connect(op1).submitPrice(100n);
    await oracle.connect(op2).submitPrice(101n);
    await oracle.connect(op3).submitPrice(99n);

    await time.increase(120);
    await expect(oracle.latestRoundData()).to.be.revertedWithCustomError(oracle, "PriceTooOld");
  });
});

describe("Multicall3", () => {
  it("aggregate batch reads", async () => {
    const Multi = await ethers.getContractFactory("Multicall3");
    const multi = await Multi.deploy();

    const calls = [
      { target: await multi.getAddress(), callData: multi.interface.encodeFunctionData("getBlockNumber") },
      { target: await multi.getAddress(), callData: multi.interface.encodeFunctionData("getChainId") },
    ];
    const [bn, results] = await multi.aggregate.staticCall(calls);
    expect(bn).to.be.gt(0n);
    expect(results.length).to.equal(2);
  });

  it("aggregate3 supporte allowFailure", async () => {
    const Multi = await ethers.getContractFactory("Multicall3");
    const multi = await Multi.deploy();

    const calls = [
      { target: await multi.getAddress(), allowFailure: false, callData: multi.interface.encodeFunctionData("getBlockNumber") },
      { target: await multi.getAddress(), allowFailure: true,  callData: "0xdeadbeef" }, // invalide
    ];
    const results = await multi.aggregate3.staticCall(calls);
    expect(results[0].success).to.be.true;
    expect(results[1].success).to.be.false;
  });

  it("getEthBalance / getChainId views", async () => {
    const Multi = await ethers.getContractFactory("Multicall3");
    const multi = await Multi.deploy();
    const [s] = await ethers.getSigners();
    const bal = await multi.getEthBalance(s.address);
    expect(bal).to.be.gt(0n);

    const cid = await multi.getChainId();
    expect(cid).to.equal((await ethers.provider.getNetwork()).chainId);
  });
});

describe("ValidatorRegistry", () => {
  const STATUS_PENDING = 1n;
  const STATUS_APPROVED = 2n;
  const STATUS_REJECTED = 3n;
  const STATUS_REMOVED = 4n;

  const ENODE = "enode://aabbcc@1.2.3.4:30303";

  // 8-decimal USD bond: 10 USD => 10 * 1e8
  const MIN_BOND_USD = 10n * 10n ** 8n;
  // Mock price = 0.10 USD per WTG (8 decimals): 1 WTG = 0.10 USD
  const PRICE_8D = 10n ** 7n;
  // bond required = (10 * 1e8 * 1e18) / 1e7 = 100 * 1e18 = 100 WTG
  const REQUIRED_WTG = ethers.parseEther("100");

  async function deployRegistry(ownerAddr: string, slashRecipient: string) {
    // Mock price feed via the existing OracleAggregator deployed on the fly.
    // Easier path: deploy a tiny inline mock that exposes latestRoundData().
    const Mock = await ethers.getContractFactory("MockPriceFeed");
    const feed = await Mock.deploy(8, PRICE_8D);
    await feed.waitForDeployment();

    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(ownerAddr, await feed.getAddress(), slashRecipient, MIN_BOND_USD);
    await reg.waitForDeployment();
    return { reg, feed };
  }

  it("admin add / update / remove (bootstrap path)", async () => {
    const [owner, v1, v2, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    await reg.add(v1.address, "WINTG", "WINTG Group", "https://wintg.network", "0xPGP", "Lomé, Togo", ENODE);
    expect(await reg.count()).to.equal(1n);

    await expect(
      reg.add(v1.address, "X", "Y", "Z", "P", "G", ENODE),
    ).to.be.revertedWithCustomError(reg, "AlreadyRegistered");

    await reg.update(v1.address, "WINTG-2", "WINTG Group", "https://wintg.network", "0xPGP", "Lomé", ENODE);
    const info = await reg.validators(v1.address);
    expect(info.name).to.equal("WINTG-2");
    expect(info.status).to.equal(STATUS_APPROVED);

    await reg.add(v2.address, "Node-Two", "Org", "https://example.org", "", "Cotonou", ENODE);
    expect((await reg.listAll()).length).to.equal(2);

    await reg.remove(v1.address);
    expect(await reg.count()).to.equal(1n);
    await expect(reg.remove(v1.address)).to.be.revertedWithCustomError(reg, "NotRegistered");
    expect((await reg.validators(v1.address)).status).to.equal(STATUS_REMOVED);
  });

  it("public candidacy: apply, approve, reject (USD-priced bond)", async () => {
    const [owner, alice, bob, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    expect(await reg.bondInWtgWei()).to.equal(REQUIRED_WTG);

    await expect(
      reg.connect(alice).applyAsValidator(
        alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE,
        { value: REQUIRED_WTG - 1n },
      ),
    ).to.be.revertedWithCustomError(reg, "InsufficientBond");

    await reg.connect(alice).applyAsValidator(
      alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE,
      { value: REQUIRED_WTG },
    );
    expect(await reg.candidateCount()).to.equal(1n);
    expect((await reg.validators(alice.address)).status).to.equal(STATUS_PENDING);

    await expect(
      reg.connect(alice).applyAsValidator(
        alice.address, "Alice", "ACME", "", "", "", ENODE, { value: REQUIRED_WTG },
      ),
    ).to.be.revertedWithCustomError(reg, "AlreadyRegistered");

    await reg.connect(bob).applyAsValidator(
      bob.address, "Bob", "BobNet", "https://bobnet.org", "", "Berlin", ENODE,
      { value: REQUIRED_WTG },
    );
    expect(await reg.candidateCount()).to.equal(2n);

    await reg.connect(owner).approveCandidate(alice.address);
    expect(await reg.count()).to.equal(1n);
    expect((await reg.validators(alice.address)).status).to.equal(STATUS_APPROVED);

    const bobBefore = await ethers.provider.getBalance(bob.address);
    await (await reg.connect(owner).rejectCandidate(bob.address)).wait();
    const bobAfter = await ethers.provider.getBalance(bob.address);
    expect(bobAfter - bobBefore).to.equal(REQUIRED_WTG);
    expect((await reg.validators(bob.address)).status).to.equal(STATUS_REJECTED);
  });

  it("clean exit refunds the remaining bond", async () => {
    const [owner, alice, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    await reg.connect(alice).applyAsValidator(
      alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE,
      { value: REQUIRED_WTG },
    );
    await reg.connect(owner).approveCandidate(alice.address);

    const before = await ethers.provider.getBalance(alice.address);
    await (await reg.connect(owner).remove(alice.address)).wait();
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before).to.equal(REQUIRED_WTG);
    expect((await reg.validators(alice.address)).status).to.equal(STATUS_REMOVED);
  });

  it("partial slashing sends to recipient, leaves the rest withdrawable", async () => {
    const [owner, alice, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    await reg.connect(alice).applyAsValidator(
      alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE,
      { value: REQUIRED_WTG },
    );
    await reg.connect(owner).approveCandidate(alice.address);

    // Slash 25 % (2500 bps)
    const tBefore = await ethers.provider.getBalance(treasury.address);
    await (await reg.connect(owner).slash(alice.address, 2500)).wait();
    const tAfter = await ethers.provider.getBalance(treasury.address);
    const slashed = (REQUIRED_WTG * 2500n) / 10_000n;
    expect(tAfter - tBefore).to.equal(slashed);

    // Remaining bond should be 75 % of original
    const info = await reg.validators(alice.address);
    expect(info.bondAmount).to.equal(REQUIRED_WTG - slashed);

    // Clean exit refunds the remainder
    const aBefore = await ethers.provider.getBalance(alice.address);
    await (await reg.connect(owner).remove(alice.address)).wait();
    const aAfter = await ethers.provider.getBalance(alice.address);
    expect(aAfter - aBefore).to.equal(REQUIRED_WTG - slashed);
  });

  it("slash reverts on bad parameters", async () => {
    const [owner, alice, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    await expect(reg.slash(alice.address, 0)).to.be.revertedWithCustomError(reg, "InvalidPercent");
    await expect(reg.slash(alice.address, 10_001)).to.be.revertedWithCustomError(reg, "InvalidPercent");
    await expect(reg.slash(alice.address, 100)).to.be.revertedWithCustomError(reg, "NotApproved");
  });

  it("setMinBondUsd updates the threshold used for new applications", async () => {
    const [owner, alice, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);

    const newUsd = 100n * 10n ** 8n; // 100 USD
    await reg.setMinBondUsd(newUsd);
    expect(await reg.minBondUsd()).to.equal(newUsd);
    // 100 USD / (0.10 USD/WTG) = 1000 WTG required
    expect(await reg.bondInWtgWei()).to.equal(ethers.parseEther("1000"));

    // Old threshold (100 WTG) is now insufficient
    await expect(
      reg.connect(alice).applyAsValidator(
        alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE,
        { value: REQUIRED_WTG },
      ),
    ).to.be.revertedWithCustomError(reg, "InsufficientBond");
  });

  it("approveCandidate / rejectCandidate revert if not pending", async () => {
    const [owner, alice, treasury] = await ethers.getSigners();
    const { reg } = await deployRegistry(owner.address, treasury.address);
    await expect(reg.approveCandidate(alice.address)).to.be.revertedWithCustomError(reg, "NotPending");
    await expect(reg.rejectCandidate(alice.address)).to.be.revertedWithCustomError(reg, "NotPending");
  });
});
