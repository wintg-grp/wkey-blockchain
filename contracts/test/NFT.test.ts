import { expect } from "chai";
import { ethers } from "hardhat";

describe("WINTGNFT (ERC-721)", () => {
  it("mint + transferts + royalties EIP-2981", async () => {
    const [admin, alice, bob, royaltyReceiver] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("WINTG Genesis", "WGEN", admin.address, royaltyReceiver.address, 500); // 5%

    // mint à alice
    await nft.connect(admin).mint(alice.address, "ipfs://QmFoo");
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.tokenURI(1)).to.equal("ipfs://QmFoo");

    // transfer
    await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);

    // royalties (EIP-2981)
    const [recv, amt] = await nft.royaltyInfo(1, 100_000);
    expect(recv).to.equal(royaltyReceiver.address);
    expect(amt).to.equal(5000n); // 5 %
  });

  it("batch mint", async () => {
    const [admin, alice, bob] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("WGEN", "WGEN", admin.address, admin.address, 0);

    await nft.connect(admin).batchMint(
      [alice.address, bob.address],
      ["ipfs://1", "ipfs://2"],
    );
    expect(await nft.totalSupply()).to.equal(2n);
    expect(await nft.tokenURI(1)).to.equal("ipfs://1");
  });

  it("MINTER_ROLE requis pour minter", async () => {
    const [admin, stranger] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("X", "X", admin.address, admin.address, 0);

    await expect(nft.connect(stranger).mint(stranger.address, "x")).to.be.revertedWithCustomError(
      nft,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("pause bloque les transferts", async () => {
    const [admin, alice, bob] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("WINTGNFT");
    const nft = await NFT.deploy("X", "X", admin.address, admin.address, 0);
    await nft.connect(admin).mint(alice.address, "x");
    await nft.connect(admin).pause();

    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 1),
    ).to.be.revertedWithCustomError(nft, "EnforcedPause");
  });
});

describe("WINTGCollection (ERC-1155)", () => {
  it("mint single + batch + royalties", async () => {
    const [admin, alice, royalty] = await ethers.getSigners();
    const C = await ethers.getContractFactory("WINTGCollection");
    const c = await C.deploy("WINTG Items", "WITM", "ipfs://meta/{id}.json", admin.address, royalty.address, 250); // 2.5 %

    await c.connect(admin).mint(alice.address, 1, 100, "0x");
    expect(await c.balanceOf(alice.address, 1)).to.equal(100n);

    await c.connect(admin).mintBatch(alice.address, [2, 3], [10, 20], "0x");
    expect(await c["totalSupply(uint256)"](2)).to.equal(10n);
    expect(await c["totalSupply(uint256)"](3)).to.equal(20n);

    const [recv, amt] = await c.royaltyInfo(1, 1000);
    expect(recv).to.equal(royalty.address);
    expect(amt).to.equal(25n);
  });
});
