/**
 * Batch 7 — Bridges smoke test.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("Batch 7 — Bridges", () => {
  let owner: Signer, treasury: Signer, alice: Signer;
  let v1: Signer, v2: Signer, v3: Signer, v4: Signer, v5: Signer;
  let token: any;

  beforeEach(async () => {
    [owner, treasury, alice, v1, v2, v3, v4, v5] = await ethers.getSigners();
    const ERC = await ethers.getContractFactory("MockERC20");
    token = await ERC.deploy();
  });

  it("BridgeAdapter ETH: lockOut + releaseIn flow with quorum", async () => {
    const remoteChain = ethers.keccak256(ethers.toUtf8Bytes("ethereum"));
    const validators = [v1, v2, v3, v4, v5];
    const validatorAddrs = await Promise.all(validators.map((v) => v.getAddress()));

    const Bridge = await ethers.getContractFactory("BridgeAdapter");
    const bridge = await Bridge.deploy(
      await owner.getAddress(),
      remoteChain,
      validatorAddrs,
      3, // 3-of-5
      await treasury.getAddress(),
      ethers.parseEther("100000"),
    );

    // Support the token
    await bridge.connect(owner).setSupportedToken(await token.getAddress(), true);

    // Alice locks 1000 tokens out (toward Ethereum)
    await token.transfer(await alice.getAddress(), ethers.parseEther("10000"));
    await token.connect(alice).approve(await bridge.getAddress(), ethers.parseEther("1000"));

    const recipientEthAddr = ethers.zeroPadBytes("0x1234567890123456789012345678901234567890", 32);
    const txOut = await bridge.connect(alice).lockOut(
      await token.getAddress(), ethers.parseEther("1000"), recipientEthAddr,
    );
    const r = await txOut.wait();
    const ev = r!.logs.find((l: any) => l.fragment?.name === "LockedOut") as any;
    expect(ev.args[5]).to.not.equal(ethers.ZeroHash); // outboundId

    // Treasury got 0,1 % = 1 token
    expect(await token.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther("1"));

    // ---- Inbound : validators sign release ----
    const remoteTxHash = ethers.keccak256(ethers.toUtf8Bytes("eth-tx-12345"));
    const releaseAmount = ethers.parseEther("500");
    // Pre-fund the bridge so it can release.
    await token.transfer(await bridge.getAddress(), releaseAmount);

    // Build the canonical message hash
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "bytes32", "bytes32", "address", "address", "uint256"],
        ["WINTG-BRIDGE", remoteChain, remoteTxHash, await token.getAddress(), await alice.getAddress(), releaseAmount],
      ),
    );
    // Sign with 3 validators (quorum)
    const signatures: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await validators[i].signMessage(ethers.getBytes(messageHash));
      signatures.push(s);
    }

    const beforeAlice = await token.balanceOf(await alice.getAddress());
    await bridge.releaseIn(remoteTxHash, await token.getAddress(), await alice.getAddress(), releaseAmount, signatures);
    const afterAlice = await token.balanceOf(await alice.getAddress());
    expect(afterAlice - beforeAlice).to.equal(releaseAmount);

    // Replay attack
    await expect(
      bridge.releaseIn(remoteTxHash, await token.getAddress(), await alice.getAddress(), releaseAmount, signatures)
    ).to.be.revertedWithCustomError(bridge, "AlreadyProcessed");
  });

  it("BridgeAdapter: insufficient signatures revert", async () => {
    const remoteChain = ethers.keccak256(ethers.toUtf8Bytes("bnb"));
    const validatorAddrs = [await v1.getAddress(), await v2.getAddress(), await v3.getAddress()];
    const Bridge = await ethers.getContractFactory("BridgeAdapter");
    const bridge = await Bridge.deploy(
      await owner.getAddress(), remoteChain, validatorAddrs, 2, await treasury.getAddress(), ethers.parseEther("10000"),
    );
    await bridge.connect(owner).setSupportedToken(await token.getAddress(), true);

    const remoteTxHash = ethers.keccak256(ethers.toUtf8Bytes("bnb-tx"));
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "bytes32", "bytes32", "address", "address", "uint256"],
        ["WINTG-BRIDGE", remoteChain, remoteTxHash, await token.getAddress(), await alice.getAddress(), ethers.parseEther("100")],
      ),
    );
    const sig = await v1.signMessage(ethers.getBytes(messageHash));
    await expect(
      bridge.releaseIn(remoteTxHash, await token.getAddress(), await alice.getAddress(), ethers.parseEther("100"), [sig])
    ).to.be.revertedWithCustomError(bridge, "InsufficientSignatures");
  });

  it("BridgeAdapter: maxPerTx limit", async () => {
    const remoteChain = ethers.keccak256(ethers.toUtf8Bytes("ethereum"));
    const Bridge = await ethers.getContractFactory("BridgeAdapter");
    const bridge = await Bridge.deploy(
      await owner.getAddress(), remoteChain,
      [await v1.getAddress(), await v2.getAddress(), await v3.getAddress()], 2,
      await treasury.getAddress(), ethers.parseEther("100"),
    );
    await bridge.connect(owner).setSupportedToken(await token.getAddress(), true);
    await token.transfer(await alice.getAddress(), ethers.parseEther("1000"));
    await token.connect(alice).approve(await bridge.getAddress(), ethers.parseEther("1000"));

    await expect(
      bridge.connect(alice).lockOut(await token.getAddress(), ethers.parseEther("200"), "0x1234")
    ).to.be.revertedWithCustomError(bridge, "ExceedsMaxPerTx");
  });
});
