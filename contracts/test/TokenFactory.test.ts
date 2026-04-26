import { expect } from "chai";
import { ethers, network } from "hardhat";

const ONE = 10n ** 18n;

beforeEach(async () => {
  await network.provider.send("hardhat_reset");
});

describe("ERC20Factory", () => {
  async function fixture() {
    const [owner, alice, treasury] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ERC20Factory");
    const factory = await Factory.deploy(owner.address, treasury.address, 100n * ONE);
    return { factory, owner, alice, treasury };
  }

  it("crée un ERC-20 contre 100 WTG", async () => {
    const { factory, alice, treasury } = await fixture();
    const tBefore = await ethers.provider.getBalance(treasury.address);
    await factory.connect(alice).createERC20(
      "MyToken", "MTK", 18, 1_000_000n * ONE, true,
      { value: 100n * ONE },
    );
    const tAfter = await ethers.provider.getBalance(treasury.address);
    expect(tAfter - tBefore).to.equal(100n * ONE);
    expect(await factory.totalTokensCreated()).to.equal(1n);

    const tokenAddr = await factory.allTokens(0);
    const token = await ethers.getContractAt("SimpleERC20", tokenAddr);
    expect(await token.name()).to.equal("MyToken");
    expect(await token.balanceOf(alice.address)).to.equal(1_000_000n * ONE);
    expect(await token.owner()).to.equal(alice.address);
  });

  it("revert si fee insuffisant", async () => {
    const { factory, alice } = await fixture();
    await expect(
      factory.connect(alice).createERC20("X", "X", 18, ONE, false, { value: 50n * ONE }),
    ).to.be.revertedWithCustomError(factory, "InsufficientFee");
  });

  it("rembourse l'excès de fee", async () => {
    const { factory, alice } = await fixture();
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await factory.connect(alice).createERC20(
      "X", "X", 18, ONE, false, { value: 200n * ONE },
    );
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(before - after - gas).to.equal(100n * ONE);
  });

  it("setFee + plafond MAX_FEE", async () => {
    const { factory, owner, alice } = await fixture();
    await expect(
      factory.connect(alice).setFee(50n * ONE),
    ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await factory.connect(owner).setFee(50n * ONE);
    expect(await factory.fee()).to.equal(50n * ONE);
    await expect(
      factory.connect(owner).setFee(20_000n * ONE),
    ).to.be.revertedWithCustomError(factory, "FeeTooHigh");
  });

  it("listTokens pagination", async () => {
    const { factory, alice } = await fixture();
    for (let i = 0; i < 3; i++) {
      await factory.connect(alice).createERC20(
        `T${i}`, `T${i}`, 18, ONE, false, { value: 100n * ONE },
      );
    }
    expect((await factory.listTokens(0, 2)).length).to.equal(2);
    expect((await factory.listTokens(2, 10)).length).to.equal(1);
  });

  it("constructor revert : zero treasury / fee trop haut", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ERC20Factory");
    await expect(
      Factory.deploy(owner.address, ethers.ZeroAddress, ONE),
    ).to.be.revertedWithCustomError(Factory, "ZeroAddress");
    await expect(
      Factory.deploy(owner.address, owner.address, 100_000n * ONE),
    ).to.be.revertedWithCustomError(Factory, "FeeTooHigh");
  });

  it("name vide revert", async () => {
    const { factory, alice } = await fixture();
    await expect(
      factory.connect(alice).createERC20("", "X", 18, ONE, false, { value: 100n * ONE }),
    ).to.be.revertedWithCustomError(factory, "EmptyName");
  });

  it("setTreasury rotation + pause + zero revert", async () => {
    const { factory, owner, alice } = await fixture();
    await factory.connect(owner).setTreasury(alice.address);
    expect(await factory.treasury()).to.equal(alice.address);

    await factory.connect(owner).pause();
    await expect(
      factory.connect(alice).createERC20("X", "X", 18, ONE, false, { value: 100n * ONE }),
    ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    await factory.connect(owner).unpause();

    await expect(
      factory.connect(owner).setTreasury(ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });
});

describe("NFTFactory", () => {
  async function fixture() {
    const [owner, alice, treasury] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NFTFactory");
    const factory = await Factory.deploy(
      owner.address, treasury.address, 50n * ONE, 50n * ONE,
    );
    return { factory, owner, alice, treasury };
  }

  it("crée un ERC-721 contre 50 WTG", async () => {
    const { factory, alice } = await fixture();
    await factory.connect(alice).createERC721(
      "WintgArt", "WART", alice.address, 500,
      { value: 50n * ONE },
    );
    expect(await factory.totalCollections()).to.equal(1n);

    const collAddr = await factory.allCollections(0);
    const nft = await ethers.getContractAt("WINTGNFT", collAddr);
    expect(await nft.name()).to.equal("WintgArt");
    await nft.connect(alice).mint(alice.address, "ipfs://test");
    expect(await nft.ownerOf(1)).to.equal(alice.address);
  });

  it("crée un ERC-1155 contre 50 WTG", async () => {
    const { factory, alice } = await fixture();
    await factory.connect(alice).createERC1155(
      "Items", "WITM", "ipfs://meta/{id}.json", alice.address, 250,
      { value: 50n * ONE },
    );
    expect(await factory.totalCollections()).to.equal(1n);

    const collAddr = await factory.allCollections(0);
    const c = await ethers.getContractAt("WINTGCollection", collAddr);
    await c.connect(alice).mint(alice.address, 1, 100, "0x");
    expect(await c.balanceOf(alice.address, 1)).to.equal(100n);
  });

  it("setFees + plafond MAX_FEE", async () => {
    const { factory, owner } = await fixture();
    await factory.connect(owner).setFees(75n * ONE, 75n * ONE);
    expect(await factory.erc721Fee()).to.equal(75n * ONE);
    await expect(
      factory.connect(owner).setFees(20_000n * ONE, 75n * ONE),
    ).to.be.revertedWithCustomError(factory, "FeeTooHigh");
  });

  it("name vide / royalty zero revert", async () => {
    const { factory, alice } = await fixture();
    await expect(
      factory.connect(alice).createERC721("", "X", alice.address, 100, { value: 50n * ONE }),
    ).to.be.revertedWithCustomError(factory, "EmptyName");
    await expect(
      factory.connect(alice).createERC721("X", "X", ethers.ZeroAddress, 100, { value: 50n * ONE }),
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });

  it("setTreasury + pause", async () => {
    const { factory, owner, alice } = await fixture();
    await factory.connect(owner).setTreasury(alice.address);
    await factory.connect(owner).pause();
    await expect(
      factory.connect(alice).createERC721("X", "X", alice.address, 100, { value: 50n * ONE }),
    ).to.be.revertedWithCustomError(factory, "EnforcedPause");
  });

  it("constructor revert : zero treasury / fee trop haut", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NFTFactory");
    await expect(
      Factory.deploy(owner.address, ethers.ZeroAddress, ONE, ONE),
    ).to.be.revertedWithCustomError(Factory, "ZeroAddress");
    await expect(
      Factory.deploy(owner.address, owner.address, 100_000n * ONE, ONE),
    ).to.be.revertedWithCustomError(Factory, "FeeTooHigh");
  });

  it("collectionsByCreator filtré", async () => {
    const { factory, alice, owner } = await fixture();
    await factory.connect(alice).createERC721("A", "A", alice.address, 0, { value: 50n * ONE });
    await factory.connect(owner).createERC1155("B", "B", "ipfs://", owner.address, 0, { value: 50n * ONE });
    expect(await factory.collectionsByCreatorCount(alice.address)).to.equal(1n);
    expect(await factory.collectionsByCreatorCount(owner.address)).to.equal(1n);
  });
});

describe("SimpleERC20 — template", () => {
  it("mint additionnel possible si mintable=true", async () => {
    const [, alice] = await ethers.getSigners();
    const T = await ethers.getContractFactory("SimpleERC20");
    const t = await T.deploy("X", "X", 18, ONE, alice.address, true);
    await t.connect(alice).mint(alice.address, ONE);
    expect(await t.totalSupply()).to.equal(2n * ONE);
  });

  it("mint revert si mintable=false", async () => {
    const [, alice] = await ethers.getSigners();
    const T = await ethers.getContractFactory("SimpleERC20");
    const t = await T.deploy("X", "X", 18, ONE, alice.address, false);
    await expect(t.connect(alice).mint(alice.address, ONE)).to.be.revertedWithCustomError(
      t, "MintingDisabled",
    );
  });

  it("decimals customisables (6, USDC-like)", async () => {
    const [, alice] = await ethers.getSigners();
    const T = await ethers.getContractFactory("SimpleERC20");
    const t = await T.deploy("USDC", "USDC", 6, 1000n * 10n ** 6n, alice.address, false);
    expect(await t.decimals()).to.equal(6);
  });

  it("decimals > 18 revert", async () => {
    const [, alice] = await ethers.getSigners();
    const T = await ethers.getContractFactory("SimpleERC20");
    await expect(
      T.deploy("X", "X", 19, ONE, alice.address, false),
    ).to.be.revertedWithCustomError(T, "InvalidDecimals");
  });

  it("burn / burnFrom", async () => {
    const [, alice, bob] = await ethers.getSigners();
    const T = await ethers.getContractFactory("SimpleERC20");
    const t = await T.deploy("X", "X", 18, 100n * ONE, alice.address, false);
    await t.connect(alice).burn(10n * ONE);
    expect(await t.totalSupply()).to.equal(90n * ONE);

    await t.connect(alice).approve(bob.address, 5n * ONE);
    await t.connect(bob).burnFrom(alice.address, 5n * ONE);
    expect(await t.totalSupply()).to.equal(85n * ONE);
  });
});
