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
  const BOND = ethers.parseEther("100");

  it("admin add / update / remove (bootstrap path)", async () => {
    const [owner, v1, v2] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(owner.address, BOND);

    await reg.add(v1.address, "WINTG", "WINTG SARL", "https://wintg.network", "0xPGP", "Lomé, Togo", ENODE);
    expect(await reg.count()).to.equal(1n);

    // Doublon
    await expect(
      reg.add(v1.address, "X", "Y", "Z", "P", "G", ENODE),
    ).to.be.revertedWithCustomError(reg, "AlreadyRegistered");

    // Update
    await reg.update(v1.address, "WINTG-2", "WINTG SARL", "https://wintg.network", "0xPGP", "Lomé", ENODE);
    const info = await reg.validators(v1.address);
    expect(info.name).to.equal("WINTG-2");
    expect(info.status).to.equal(STATUS_APPROVED);

    // Ajout d'un 2e
    await reg.add(v2.address, "UCAO", "UCAO Univ", "https://ucao.bj", "", "Cotonou", ENODE);
    const all = await reg.listAll();
    expect(all.length).to.equal(2);

    // Remove
    await reg.remove(v1.address);
    expect(await reg.count()).to.equal(1n);
    await expect(reg.remove(v1.address)).to.be.revertedWithCustomError(reg, "NotRegistered");
    expect((await reg.validators(v1.address)).status).to.equal(STATUS_REMOVED);
  });

  it("public candidacy : apply, approve, reject", async () => {
    const [owner, alice, bob] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(owner.address, BOND);

    // Bond insuffisant
    await expect(
      reg
        .connect(alice)
        .applyAsValidator(alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE, {
          value: BOND - 1n,
        }),
    ).to.be.revertedWithCustomError(reg, "InsufficientBond");

    // Candidature OK
    await reg
      .connect(alice)
      .applyAsValidator(alice.address, "Alice", "ACME", "https://acme.io", "", "Paris", ENODE, {
        value: BOND,
      });
    expect(await reg.candidateCount()).to.equal(1n);
    expect((await reg.validators(alice.address)).status).to.equal(STATUS_PENDING);

    // Re-candidature interdite
    await expect(
      reg
        .connect(alice)
        .applyAsValidator(alice.address, "Alice", "ACME", "", "", "", ENODE, { value: BOND }),
    ).to.be.revertedWithCustomError(reg, "AlreadyRegistered");

    // Bob postule également
    await reg
      .connect(bob)
      .applyAsValidator(bob.address, "Bob", "BobNet", "https://bobnet.org", "", "Berlin", ENODE, {
        value: BOND,
      });
    expect(await reg.candidateCount()).to.equal(2n);

    // Approve Alice → passe en validateur actif
    await reg.connect(owner).approveCandidate(alice.address);
    expect(await reg.count()).to.equal(1n);
    expect(await reg.candidateCount()).to.equal(1n);
    expect((await reg.validators(alice.address)).status).to.equal(STATUS_APPROVED);

    // Reject Bob → bond restitué
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const tx = await reg.connect(owner).rejectCandidate(bob.address);
    await tx.wait();
    const bobAfter = await ethers.provider.getBalance(bob.address);
    expect(bobAfter - bobBefore).to.equal(BOND);
    expect((await reg.validators(bob.address)).status).to.equal(STATUS_REJECTED);
    expect(await reg.candidateCount()).to.equal(0n);
  });

  it("approveCandidate revert si pas pending", async () => {
    const [owner, alice] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(owner.address, BOND);

    await expect(reg.approveCandidate(alice.address)).to.be.revertedWithCustomError(reg, "NotPending");
    await expect(reg.rejectCandidate(alice.address)).to.be.revertedWithCustomError(reg, "NotPending");
  });

  it("setMinBond modifie le seuil", async () => {
    const [owner] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(owner.address, BOND);

    await reg.setMinBond(ethers.parseEther("1000"));
    expect(await reg.minBond()).to.equal(ethers.parseEther("1000"));
  });
});
