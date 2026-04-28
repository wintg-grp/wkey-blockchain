/**
 * Batch 1 — End-to-end smoke test.
 *
 * Verifies that the 5 core Phase-1.5 contracts deploy together, wire up
 * correctly, and behave as expected on the integration paths that matter:
 *   - Token creation through the factory (paid + free for team)
 *   - Tier 1 (FactoryCreated) badge auto-set
 *   - Tier 2 (WintgVerified) request → approve flow
 *   - Logo URI mutability window
 *   - WintgMultiSender — ERC20 + native bulk send
 *
 * Run with:  npx hardhat test test/Batch1.test.ts
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("Batch 1 — integration", () => {
  let owner: Signer;
  let admin: Signer;
  let treasury: Signer;
  let creator: Signer;
  let teamMember: Signer;
  let alice: Signer;
  let bob: Signer;

  let registry: any;
  let factory: any;
  let multiSender: any;
  let chainMeta: any;

  beforeEach(async () => {
    [owner, admin, treasury, creator, teamMember, alice, bob] = await ethers.getSigners();

    const Reg = await ethers.getContractFactory("VerificationRegistry");
    registry = await Reg.deploy(await owner.getAddress(), await admin.getAddress(), await treasury.getAddress());

    const Fact = await ethers.getContractFactory("ERC20FactoryV2");
    factory = await Fact.deploy(await owner.getAddress(), await treasury.getAddress(), await registry.getAddress());

    // Authorize the factory in the registry.
    await registry.connect(owner).setFactoryAuthorized(await factory.getAddress(), true);

    // Add team member.
    await factory.connect(owner).addTeamMember(await teamMember.getAddress());

    const MS = await ethers.getContractFactory("WintgMultiSender");
    multiSender = await MS.deploy();

    const Meta = await ethers.getContractFactory("WintgChainMetadata");
    chainMeta = await Meta.deploy(
      await owner.getAddress(),
      await admin.getAddress(),
      "WINTG",
      "WINTG",
      "WINTG",
      "WTG"
    );
  });

  it("WintgChainMetadata initial state", async () => {
    expect(await chainMeta.chainName()).to.equal("WINTG");
    expect(await chainMeta.nativeTokenSymbol()).to.equal("WTG");
    expect(await chainMeta.version()).to.equal(1n);
  });

  it("paid token creation distributes 70/20/10 and sets FactoryCreated tier", async () => {
    const trBefore    = await ethers.provider.getBalance(await treasury.getAddress());
    const adminBefore = await ethers.provider.getBalance(await admin.getAddress());
    const burnBefore  = await ethers.provider.getBalance("0x000000000000000000000000000000000000dEaD");

    const tx = await factory.connect(creator).createToken(
      {
        name: "MyToken",
        symbol: "MYT",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("100000"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "ipfs://QmInitialLogo123",
      },
      { value: ethers.parseEther("100") }
    );
    const receipt = await tx.wait();

    // Decode TokenCreated event for the address.
    const tokenAddress = (await factory.tokens(0)) as string;
    expect(tokenAddress).to.not.equal(ethers.ZeroAddress);

    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);
    expect(await token.name()).to.equal("MyToken");
    expect(await token.balanceOf(await creator.getAddress())).to.equal(ethers.parseEther("100000"));
    expect(await token.verificationTier()).to.equal(1n); // FactoryCreated

    const trAfter    = await ethers.provider.getBalance(await treasury.getAddress());
    const adminAfter = await ethers.provider.getBalance(await admin.getAddress());
    const burnAfter  = await ethers.provider.getBalance("0x000000000000000000000000000000000000dEaD");

    expect(trAfter    - trBefore).to.equal(ethers.parseEther("70"));
    expect(adminAfter - adminBefore).to.equal(ethers.parseEther("20"));
    expect(burnAfter  - burnBefore).to.equal(ethers.parseEther("10"));
  });

  it("team member creates token for free", async () => {
    await factory.connect(teamMember).createToken(
      {
        name: "TeamToken",
        symbol: "TTK",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1000"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "",
      },
      { value: 0 }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);
    expect(await token.balanceOf(await teamMember.getAddress())).to.equal(ethers.parseEther("1000"));
  });

  it("verification request → approve → tier upgrade to WintgVerified", async () => {
    // Create a token first.
    await factory.connect(creator).createToken(
      {
        name: "ToVerify",
        symbol: "VER",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1000"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "",
      },
      { value: ethers.parseEther("100") }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);

    // The token's "admin" (= creator since they pay) requests verification.
    await registry.connect(creator).requestVerification(tokenAddress, {
      value: ethers.parseEther("500"),
    });

    // Admin approves.
    await registry.connect(admin).approveVerification(tokenAddress);

    expect(await token.verificationTier()).to.equal(2n); // WintgVerified
  });

  it("setOfficial promotes a token to tier 3", async () => {
    await factory.connect(teamMember).createToken(
      {
        name: "Official",
        symbol: "OFF",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "",
      },
      { value: 0 }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    await registry.connect(owner).setOfficial(tokenAddress);
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);
    expect(await token.verificationTier()).to.equal(3n); // WintgOfficial
  });

  it("WintgMultiSender — ERC20 bulk send works", async () => {
    // Create a token, the team member ends up holding everything.
    await factory.connect(teamMember).createToken(
      {
        name: "Bulky",
        symbol: "BLK",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1000"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "",
      },
      { value: 0 }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);

    // approve + multisend
    await token.connect(teamMember).approve(await multiSender.getAddress(), ethers.parseEther("300"));

    await multiSender.connect(teamMember).multisendERC20(
      tokenAddress,
      [await alice.getAddress(), await bob.getAddress()],
      [ethers.parseEther("100"), ethers.parseEther("200")]
    );

    expect(await token.balanceOf(await alice.getAddress())).to.equal(ethers.parseEther("100"));
    expect(await token.balanceOf(await bob.getAddress())).to.equal(ethers.parseEther("200"));
  });

  it("WintgMultiSender — native WTG bulk send works", async () => {
    const before = await ethers.provider.getBalance(await alice.getAddress());

    await multiSender.connect(creator).multisendNative(
      [await alice.getAddress()],
      [ethers.parseEther("3")],
      { value: ethers.parseEther("3") }
    );

    const after = await ethers.provider.getBalance(await alice.getAddress());
    expect(after - before).to.equal(ethers.parseEther("3"));
  });

  it("logoURI mutable once within 15 days then locks", async () => {
    await factory.connect(teamMember).createToken(
      {
        name: "Lockable",
        symbol: "LCK",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1"),
        hasVotes: false,
        isMintable: false,
        isSoulbound: false,
        logoURI: "ipfs://QmFirstLogo123",
      },
      { value: 0 }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);

    expect(await token.logoURI()).to.equal("ipfs://QmFirstLogo123");

    // Update once — OK
    await token.connect(teamMember).setLogoURI("ipfs://QmSecondLogo456");
    expect(await token.logoURI()).to.equal("ipfs://QmSecondLogo456");
    expect(await token.logoLocked()).to.equal(true);

    // Try again — reverts
    await expect(token.connect(teamMember).setLogoURI("ipfs://QmThird")).to.be.reverted;
  });

  it("ERC20Votes auto-delegates to self on first receive", async () => {
    await factory.connect(teamMember).createToken(
      {
        name: "Votes",
        symbol: "VOT",
        cap: ethers.parseEther("1000000"),
        initialSupply: ethers.parseEther("1000"),
        hasVotes: true,
        isMintable: false,
        isSoulbound: false,
        logoURI: "",
      },
      { value: 0 }
    );
    const tokenAddress = (await factory.tokens(0)) as string;
    const token = await ethers.getContractAt("SimpleERC20V2", tokenAddress);

    await token.connect(teamMember).transfer(await alice.getAddress(), ethers.parseEther("100"));

    expect(await token.delegates(await alice.getAddress())).to.equal(await alice.getAddress());
    expect(await token.getVotes(await alice.getAddress())).to.equal(ethers.parseEther("100"));
  });
});
