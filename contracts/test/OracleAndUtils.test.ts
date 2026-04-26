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
  it("add / list / update / remove", async () => {
    const [owner, v1, v2] = await ethers.getSigners();
    const Reg = await ethers.getContractFactory("ValidatorRegistry");
    const reg = await Reg.deploy(owner.address);

    await reg.add(v1.address, "WINTG", "WINTG SARL", "https://wkey.app", "0xPGP", "Lomé, Togo");
    expect(await reg.count()).to.equal(1n);

    // Doublon
    await expect(reg.add(v1.address, "X", "Y", "Z", "P", "G")).to.be.revertedWithCustomError(
      reg,
      "AlreadyRegistered",
    );

    // Update
    await reg.update(v1.address, "WINTG-2", "WINTG SARL", "https://wkey.app", "0xPGP", "Lomé", false);
    const info = await reg.validators(v1.address);
    expect(info.name).to.equal("WINTG-2");
    expect(info.active).to.be.false;

    // Add un 2e
    await reg.add(v2.address, "UCAO", "UCAO Univ", "https://ucao.bj", "", "Cotonou");
    const all = await reg.listAll();
    expect(all.length).to.equal(2);

    // Remove
    await reg.remove(v1.address);
    expect(await reg.count()).to.equal(1n);
    await expect(reg.remove(v1.address)).to.be.revertedWithCustomError(reg, "NotRegistered");
  });
});
