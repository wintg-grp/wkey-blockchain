import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_WTG = 10n ** 18n;

describe("WINTGTreasury (multisig)", () => {
  it("deploy 2-of-3 OK", async () => {
    const [s1, s2, s3] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address, s3.address], 2);
    await m.waitForDeployment();

    expect(await m.threshold()).to.equal(2);
    expect(await m.signersCount()).to.equal(3);
    expect(await m.isSigner(s1.address)).to.be.true;
  });

  it("rejette threshold invalide / signataires invalides", async () => {
    const [s1, s2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");

    await expect(Factory.deploy([s1.address, s2.address], 0)).to.be.revertedWithCustomError(
      Factory,
      "InvalidThreshold",
    );
    await expect(Factory.deploy([s1.address, s2.address], 3)).to.be.revertedWithCustomError(
      Factory,
      "InvalidThreshold",
    );
    await expect(Factory.deploy([ethers.ZeroAddress, s1.address], 1)).to.be.revertedWithCustomError(
      Factory,
      "ZeroAddress",
    );
    await expect(Factory.deploy([s1.address, s1.address], 2)).to.be.revertedWithCustomError(
      Factory,
      "DuplicateSigner",
    );
  });

  it("submit + confirm + execute (flow 2-of-3)", async () => {
    const [s1, s2, s3, recipient, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address, s3.address], 2);
    await m.waitForDeployment();

    // Funder le multisig
    await s1.sendTransaction({ to: await m.getAddress(), value: 5n * ONE_WTG });

    // Stranger ne peut pas submit
    await expect(
      m.connect(stranger).submit(recipient.address, ONE_WTG, "0x", 0),
    ).to.be.revertedWithCustomError(m, "NotSigner");

    // s1 submit + auto-confirm (1/2)
    await m.connect(s1).submit(recipient.address, ONE_WTG, "0x", 0);
    expect((await m.transactions(0)).confirmations).to.equal(1n);

    // execute trop tôt
    await expect(m.connect(s1).execute(0)).to.be.revertedWithCustomError(m, "InsufficientConfirmations");

    // s2 confirme (2/2)
    await m.connect(s2).confirm(0);

    // double confirm
    await expect(m.connect(s2).confirm(0)).to.be.revertedWithCustomError(m, "AlreadyConfirmed");

    // execute OK
    const before = await ethers.provider.getBalance(recipient.address);
    await m.connect(s3).execute(0);
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(ONE_WTG);

    // Re-execute impossible
    await expect(m.connect(s1).execute(0)).to.be.revertedWithCustomError(m, "AlreadyExecuted");
  });

  it("revoke confirmation avant execute", async () => {
    const [s1, s2, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address], 2);
    await m.waitForDeployment();
    await s1.sendTransaction({ to: await m.getAddress(), value: ONE_WTG });

    await m.connect(s1).submit(recipient.address, ONE_WTG, "0x", 0);
    await m.connect(s2).confirm(0);

    // s2 revoke
    await m.connect(s2).revokeConfirmation(0);
    expect((await m.transactions(0)).confirmations).to.equal(1n);

    // Plus assez de signatures pour exécuter
    await expect(m.connect(s1).execute(0)).to.be.revertedWithCustomError(m, "InsufficientConfirmations");

    // Re-revoke impossible
    await expect(m.connect(s2).revokeConfirmation(0)).to.be.revertedWithCustomError(m, "NotConfirmed");
  });

  it("timelock empêche l'exécution prématurée", async () => {
    const [s1, s2, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address], 2);
    await m.waitForDeployment();
    await s1.sendTransaction({ to: await m.getAddress(), value: ONE_WTG });

    const future = BigInt(await time.latest()) + 3600n;
    await m.connect(s1).submit(recipient.address, ONE_WTG, "0x", future);
    await m.connect(s2).confirm(0);

    await expect(m.connect(s1).execute(0)).to.be.revertedWithCustomError(m, "TimelockActive");
    await time.increaseTo(future);
    await expect(m.connect(s1).execute(0)).to.not.be.reverted;
  });

  it("rotation des signataires via self-call", async () => {
    const [s1, s2, s3, sNew] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WINTGTreasury");
    const m = await Factory.deploy([s1.address, s2.address, s3.address], 2);
    await m.waitForDeployment();

    // Tentative directe : revert
    await expect(
      m.connect(s1).updateSigners([sNew.address, s1.address], 1),
    ).to.be.revertedWithCustomError(m, "OnlySelf");

    // Via self-call : OK
    const data = m.interface.encodeFunctionData("updateSigners", [
      [sNew.address, s1.address],
      1,
    ]);
    await m.connect(s1).submit(await m.getAddress(), 0, data, 0);
    await m.connect(s2).confirm(0);
    await m.connect(s3).execute(0);

    expect(await m.threshold()).to.equal(1);
    expect(await m.isSigner(s2.address)).to.be.false;
    expect(await m.isSigner(sNew.address)).to.be.true;
  });
});
