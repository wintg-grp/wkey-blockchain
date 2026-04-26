import { expect } from "chai";
import { ethers } from "hardhat";

const ONE_WTG = 10n ** 18n;

describe("WTGToken (WWTG wrapper)", () => {
  it("metadata standard ERC20", async () => {
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();
    expect(await w.name()).to.equal("Wrapped WINTG");
    expect(await w.symbol()).to.equal("WWTG");
    expect(await w.decimals()).to.equal(18);
    expect(await w.totalSupply()).to.equal(0n);
  });

  it("deposit / withdraw 1:1", async () => {
    const [alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();

    await expect(w.connect(alice).deposit({ value: 5n * ONE_WTG }))
      .to.emit(w, "Deposit")
      .withArgs(alice.address, 5n * ONE_WTG);
    expect(await w.balanceOf(alice.address)).to.equal(5n * ONE_WTG);
    expect(await w.totalSupply()).to.equal(5n * ONE_WTG);

    await expect(w.connect(alice).withdraw(2n * ONE_WTG))
      .to.emit(w, "Withdrawal")
      .withArgs(alice.address, 2n * ONE_WTG);
    expect(await w.balanceOf(alice.address)).to.equal(3n * ONE_WTG);
    expect(await w.totalSupply()).to.equal(3n * ONE_WTG);
  });

  it("receive() = deposit automatique", async () => {
    const [alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();

    await alice.sendTransaction({ to: await w.getAddress(), value: ONE_WTG });
    expect(await w.balanceOf(alice.address)).to.equal(ONE_WTG);
  });

  it("depositTo / withdrawTo", async () => {
    const [alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();

    await w.connect(alice).depositTo(bob.address, { value: ONE_WTG });
    expect(await w.balanceOf(bob.address)).to.equal(ONE_WTG);

    await w.connect(bob).withdrawTo(alice.address, ONE_WTG);
    expect(await w.balanceOf(bob.address)).to.equal(0n);
  });

  it("revert : amount = 0 / insufficient", async () => {
    const [alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();

    await expect(w.connect(alice).deposit({ value: 0 })).to.be.revertedWithCustomError(
      w,
      "AmountIsZero",
    );
    await expect(w.connect(alice).withdraw(0)).to.be.revertedWithCustomError(w, "AmountIsZero");
    await expect(w.connect(alice).withdraw(ONE_WTG)).to.be.revertedWithCustomError(
      w,
      "InsufficientBalance",
    );
  });

  it("permit (EIP-2612) approuve sans tx du holder", async () => {
    const [alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WTGToken");
    const w = await Factory.deploy();
    await w.connect(alice).deposit({ value: 10n * ONE_WTG });

    // Utiliser le timestamp on-chain (pas l'horloge système) pour éviter le drift Hardhat
    const { time } = await import("@nomicfoundation/hardhat-network-helpers");
    const deadline = BigInt(await time.latest()) + 3600n;
    const value = 5n * ONE_WTG;
    const nonce = await w.nonces(alice.address);

    const domain = {
      name: "Wrapped WINTG",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await w.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner",    type: "address" },
        { name: "spender",  type: "address" },
        { name: "value",    type: "uint256" },
        { name: "nonce",    type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const message = {
      owner: alice.address,
      spender: bob.address,
      value,
      nonce,
      deadline,
    };
    const sig = await alice.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    await w.permit(alice.address, bob.address, value, deadline, v, r, s);
    expect(await w.allowance(alice.address, bob.address)).to.equal(value);
  });
});
