/**
 * Batch 2 — NFT contracts smoke test.
 *
 * Verifies WINTGCollection721, WINTGCollection1155, NFTFactoryV2,
 * NFTFactory1155, WINTGMarketplace integration end-to-end.
 *
 * Run with:  npx hardhat test test/Batch2.test.ts
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const NATIVE_ADDR = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("Batch 2 — NFT", () => {
  let owner: Signer;
  let admin: Signer;
  let treasury: Signer;
  let creator: Signer;
  let teamMember: Signer;
  let alice: Signer;
  let bob: Signer;

  let registry: any;
  let factory721: any;
  let factory1155: any;
  let marketplace: any;

  beforeEach(async () => {
    [owner, admin, treasury, creator, teamMember, alice, bob] = await ethers.getSigners();

    const Reg = await ethers.getContractFactory("VerificationRegistry");
    registry = await Reg.deploy(await owner.getAddress(), await admin.getAddress(), await treasury.getAddress());

    const F721 = await ethers.getContractFactory("NFTFactoryV2");
    factory721 = await F721.deploy(await owner.getAddress(), await treasury.getAddress(), await registry.getAddress());

    const F1155 = await ethers.getContractFactory("NFTFactory1155");
    factory1155 = await F1155.deploy(await owner.getAddress(), await treasury.getAddress(), await registry.getAddress());

    await registry.connect(owner).setFactoryAuthorized(await factory721.getAddress(), true);
    await registry.connect(owner).setFactoryAuthorized(await factory1155.getAddress(), true);

    await factory721.connect(owner).addTeamMember(await teamMember.getAddress());
    await factory1155.connect(owner).addTeamMember(await teamMember.getAddress());

    const MP = await ethers.getContractFactory("WINTGMarketplace");
    marketplace = await MP.deploy(await owner.getAddress(), await treasury.getAddress());
  });

  it("creates ERC-721 collection through factory + auto tier 1", async () => {
    const cfg = {
      name: "Test721",
      symbol: "T721",
      admin: ethers.ZeroAddress,
      isSoulbound: false,
      usesBaseURI: false,
      baseURI: "",
      contractURI_: "ipfs://QmContract",
      collectionLogoURI_: "ipfs://QmLogo",
      royaltyReceiver: await creator.getAddress(),
      royaltyBps: 500,
      verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(creator).createCollection(cfg, { value: ethers.parseEther("50") });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);
    expect(await c.name()).to.equal("Test721");
    expect(await c.verificationTier()).to.equal(1n);
    expect(await c.contractURI()).to.equal("ipfs://QmContract");
    expect(await c.collectionLogoURI()).to.equal("ipfs://QmLogo");
  });

  it("creates ERC-1155 free for team member", async () => {
    const cfg = {
      name: "Test1155",
      symbol: "T1155",
      admin: ethers.ZeroAddress,
      isSoulbound: false,
      baseURI: "ipfs://QmBase/{id}.json",
      contractURI_: "",
      collectionLogoURI_: "",
      royaltyReceiver: ethers.ZeroAddress,
      royaltyBps: 0,
      verificationRegistry: ethers.ZeroAddress,
    };
    await factory1155.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory1155.collections(0);
    const c = await ethers.getContractAt("WINTGCollection1155", addr);
    expect(await c.name()).to.equal("Test1155");
    expect(await c.uri(1)).to.equal("ipfs://QmBase/{id}.json");
  });

  it("ERC-721 mint + setTokenURI + freeze blocks further updates", async () => {
    const cfg = {
      name: "MintTest", symbol: "MT", admin: ethers.ZeroAddress, isSoulbound: false,
      usesBaseURI: false, baseURI: "", contractURI_: "", collectionLogoURI_: "",
      royaltyReceiver: ethers.ZeroAddress, royaltyBps: 0, verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);

    await c.connect(teamMember).mint(await alice.getAddress(), "ipfs://QmAlice");
    expect(await c.ownerOf(0)).to.equal(await alice.getAddress());
    expect(await c.tokenURI(0)).to.equal("ipfs://QmAlice");

    await c.connect(teamMember).freezeAllTokenURIs();
    await expect(c.connect(teamMember).setTokenURI(0, "ipfs://QmNew")).to.be.reverted;
  });

  it("ERC-721 royalties EIP-2981", async () => {
    const cfg = {
      name: "Roy", symbol: "ROY", admin: ethers.ZeroAddress, isSoulbound: false,
      usesBaseURI: false, baseURI: "", contractURI_: "", collectionLogoURI_: "",
      royaltyReceiver: await creator.getAddress(), royaltyBps: 500, verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);

    await c.connect(teamMember).mint(await alice.getAddress(), "ipfs://QmAlice123");
    const [recv, amt] = await c.royaltyInfo(0, ethers.parseEther("100"));
    expect(recv).to.equal(await creator.getAddress());
    expect(amt).to.equal(ethers.parseEther("5"));
  });

  it("Soulbound 721 blocks transfers", async () => {
    const cfg = {
      name: "SBT", symbol: "SBT", admin: ethers.ZeroAddress, isSoulbound: true,
      usesBaseURI: false, baseURI: "", contractURI_: "", collectionLogoURI_: "",
      royaltyReceiver: ethers.ZeroAddress, royaltyBps: 0, verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);
    await c.connect(teamMember).mint(await alice.getAddress(), "ipfs://QmAlice123");

    await expect(c.connect(alice).transferFrom(await alice.getAddress(), await bob.getAddress(), 0)).to.be.reverted;
  });

  it("Marketplace fixed-price sale (native WTG)", async () => {
    // Create + mint NFT.
    const cfg = {
      name: "MKT", symbol: "MKT", admin: ethers.ZeroAddress, isSoulbound: false,
      usesBaseURI: false, baseURI: "", contractURI_: "", collectionLogoURI_: "",
      royaltyReceiver: await creator.getAddress(), royaltyBps: 500, verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);
    await c.connect(teamMember).mint(await alice.getAddress(), "ipfs://QmAlice");

    // Approve marketplace.
    await c.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

    // List at 1 WTG.
    await marketplace.connect(alice).listFixedPrice(0, addr, 0, 1, NATIVE_ADDR, ethers.parseEther("1"));
    const lid = 0n;

    // Buyer pays 1 WTG.
    const treasuryBefore = await ethers.provider.getBalance(await treasury.getAddress());
    const royaltyBefore  = await ethers.provider.getBalance(await creator.getAddress());
    const sellerBefore   = await ethers.provider.getBalance(await alice.getAddress());

    await marketplace.connect(bob).buy(lid, { value: ethers.parseEther("1") });

    expect(await c.ownerOf(0)).to.equal(await bob.getAddress());

    const treasuryAfter = await ethers.provider.getBalance(await treasury.getAddress());
    const royaltyAfter  = await ethers.provider.getBalance(await creator.getAddress());
    const sellerAfter   = await ethers.provider.getBalance(await alice.getAddress());

    // Platform fee: 2 % = 0.02 WTG
    expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseEther("0.02"));
    // Royalty 5 % = 0.05 WTG
    expect(royaltyAfter - royaltyBefore).to.equal(ethers.parseEther("0.05"));
    // Seller : 1 - 0.02 - 0.05 = 0.93 WTG
    expect(sellerAfter - sellerBefore).to.equal(ethers.parseEther("0.93"));
  });

  it("Marketplace English auction with anti-snipe", async () => {
    const cfg = {
      name: "AUC", symbol: "AUC", admin: ethers.ZeroAddress, isSoulbound: false,
      usesBaseURI: false, baseURI: "", contractURI_: "", collectionLogoURI_: "",
      royaltyReceiver: ethers.ZeroAddress, royaltyBps: 0, verificationRegistry: ethers.ZeroAddress,
    };
    await factory721.connect(teamMember).createCollection(cfg, { value: 0 });
    const addr = await factory721.collections(0);
    const c = await ethers.getContractAt("WINTGCollection721", addr);
    await c.connect(teamMember).mint(await alice.getAddress(), "ipfs://QmAlice");
    await c.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);

    // Auction 1h, reserve 0.5 WTG
    await marketplace.connect(alice).listAuction(0, addr, 0, 1, NATIVE_ADDR, ethers.parseEther("0.5"), 3600);
    const lid = 0n;

    // Bob bids 0.5 (reserve)
    await marketplace.connect(bob).bid(lid, 0n, { value: ethers.parseEther("0.5") });
    const after1 = await marketplace.listings(lid);
    expect(after1.topBidder).to.equal(await bob.getAddress());
    expect(after1.topBid).to.equal(ethers.parseEther("0.5"));

    // Creator bids higher (must be ≥ topBid + 5 %)
    await marketplace.connect(creator).bid(lid, 0n, { value: ethers.parseEther("0.55") });

    // Bob's previous bid refunded — check escrow zero
    expect(await marketplace.bidEscrow(lid, await bob.getAddress())).to.equal(0n);

    // Fast-forward to after end + 5 minutes (anti-snipe extension might have fired)
    await ethers.provider.send("evm_increaseTime", [3600 + 600]);
    await ethers.provider.send("evm_mine", []);
    await marketplace.connect(creator).finalizeAuction(lid);

    expect(await c.ownerOf(0)).to.equal(await creator.getAddress());
  });
});
