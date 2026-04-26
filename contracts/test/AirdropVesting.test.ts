import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const ONE_DAY = 86_400n;
const ONE_WTG = 10n ** 18n;

interface Leaf {
  account: string;
  amount: bigint;
}

function buildTree(leaves: Leaf[]) {
  const values = leaves.map((l) => [l.account, l.amount]);
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
  return tree;
}

describe("AirdropVesting", () => {
  it("claim Merkle valide + libération TGE 30 % immédiate", async () => {
    const [owner, alice, bob] = await ethers.getSigners();
    const leaves: Leaf[] = [
      { account: alice.address, amount: 100n * ONE_WTG },
      { account: bob.address,   amount: 50n * ONE_WTG  },
    ];
    const tree = buildTree(leaves);
    const root = tree.root as `0x${string}`;

    const Factory = await ethers.getContractFactory("AirdropVesting");
    const start = BigInt(await time.latest()) + 100n;
    const total = 150n * ONE_WTG;
    const c = await Factory.deploy(owner.address, root, start, total);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: total });

    await time.increaseTo(start);

    // Alice claim avec preuve valide
    const aliceProof = tree.getProof([alice.address, 100n * ONE_WTG]) as `0x${string}`[];
    const tx = await c.connect(alice).claim(100n * ONE_WTG, aliceProof);
    const r = await tx.wait();
    // Le contrat évalue à `block.timestamp >= start`, qui est ~start (drift de 1 bloc)
    // donc TGE 30 % + un epsilon de linéaire (négligeable, qq wei sur 365 jours)
    const claimedEvent = r!.logs.find(
      (l) => "fragment" in l && l.fragment.name === "Claimed",
    ) as unknown as { args: { firstRelease: bigint } } | undefined;
    expect(claimedEvent?.args.firstRelease).to.be.closeTo(30n * ONE_WTG, ONE_WTG / 100n);

    expect(await c.allocation(alice.address)).to.equal(100n * ONE_WTG);
    expect(await c.released(alice.address)).to.be.closeTo(30n * ONE_WTG, ONE_WTG / 100n);
    expect(await c.totalRegistered()).to.equal(100n * ONE_WTG);

    // Re-claim impossible
    await expect(c.connect(alice).claim(100n * ONE_WTG, aliceProof)).to.be.revertedWithCustomError(
      c,
      "AlreadyClaimed",
    );

    // Preuve invalide
    const fakeProof = ["0x" + "00".repeat(32)] as `0x${string}`[];
    await expect(c.connect(bob).claim(50n * ONE_WTG, fakeProof)).to.be.revertedWithCustomError(
      c,
      "InvalidProof",
    );
  });

  it("release après claim libère le linéaire vesté", async () => {
    const [owner, alice] = await ethers.getSigners();
    const leaves: Leaf[] = [{ account: alice.address, amount: 100n * ONE_WTG }];
    const tree = buildTree(leaves);

    const Factory = await ethers.getContractFactory("AirdropVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, 100n * ONE_WTG);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: 100n * ONE_WTG });

    await time.increaseTo(start);
    const proof = tree.getProof([alice.address, 100n * ONE_WTG]) as `0x${string}`[];
    await c.connect(alice).claim(100n * ONE_WTG, proof);

    // 6 mois plus tard : vested = 30 + 70 * 0.5 = 65 %
    await time.increaseTo(start + 182n * ONE_DAY);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await c.connect(alice).release();
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    const received = after - before + gas;

    // ~35 % de 100 = 35 WTG (variation autour)
    expect(received).to.be.closeTo(35n * ONE_WTG, ONE_WTG);
  });

  it("recoverUnclaimed bloqué avant la fenêtre + 12 mois", async () => {
    const [owner, treasury] = await ethers.getSigners();
    const tree = buildTree([{ account: owner.address, amount: 1n * ONE_WTG }]);
    const Factory = await ethers.getContractFactory("AirdropVesting");
    const start = BigInt(await time.latest()) + 100n;
    const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, 100n * ONE_WTG);
    await c.waitForDeployment();
    await owner.sendTransaction({ to: await c.getAddress(), value: 100n * ONE_WTG });

    // Avant fenêtre + 12 mois : revert
    await expect(c.connect(owner).recoverUnclaimed(treasury.address)).to.be.revertedWithCustomError(
      c,
      "WindowNotEnded",
    );

    // 365j (linéaire) + 365j (marge) plus tard : OK
    await time.increaseTo(start + 365n * ONE_DAY + 365n * ONE_DAY + 1n);
    await expect(c.connect(owner).recoverUnclaimed(treasury.address)).to.not.be.reverted;
  });
});
