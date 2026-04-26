import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const ONE_DAY = 86_400n;
const ONE_WTG = 10n ** 18n;

describe("Edge cases — couverture additionnelle", () => {
  describe("VestingVault.end()", () => {
    it("renvoie start + cliff + linearDuration", async () => {
      const [owner, ben] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("VestingVault");
      const start = 1_000_000n;
      const v = await Factory.deploy(
        owner.address, ben.address, start, 100n, 200n, 0, 1000n * ONE_WTG, false,
      );
      expect(await v.end()).to.equal(start + 100n + 200n);
    });

    it("vestedAmount() public view", async () => {
      const [owner, ben] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("VestingVault");
      const start = BigInt(await time.latest()) + 1000n;
      const v = await Factory.deploy(
        owner.address, ben.address, start, 0, 100n, 0, 1000n * ONE_WTG, false,
      );
      expect(await v.vestedAmount(start - 1n)).to.equal(0n);
      expect(await v.vestedAmount(start + 1000n)).to.equal(1000n * ONE_WTG);
    });

    it("reçoit des fonds via receive() et émet FundsReceived", async () => {
      const [owner, ben] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("VestingVault");
      const v = await Factory.deploy(
        owner.address, ben.address, 0, 0, 100n, 0, 1000n * ONE_WTG, false,
      );
      await expect(owner.sendTransaction({ to: await v.getAddress(), value: ONE_WTG }))
        .to.emit(v, "FundsReceived")
        .withArgs(owner.address, ONE_WTG);
    });
  });

  describe("AirdropVesting — flows complets", () => {
    it("release() après claim libère le linéaire supplémentaire", async () => {
      const [owner, alice] = await ethers.getSigners();
      const tree = StandardMerkleTree.of(
        [[alice.address, 100n * ONE_WTG]],
        ["address", "uint256"],
      );
      const Factory = await ethers.getContractFactory("AirdropVesting");
      const start = BigInt(await time.latest()) + 100n;
      const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, 100n * ONE_WTG);
      await owner.sendTransaction({ to: await c.getAddress(), value: 100n * ONE_WTG });

      await time.increaseTo(start);
      const proof = tree.getProof([alice.address, 100n * ONE_WTG]) as `0x${string}`[];
      await c.connect(alice).claim(100n * ONE_WTG, proof);

      // Avancer de 30 jours et libérer
      await time.increaseTo(start + 30n * ONE_DAY);
      await expect(c.connect(alice).release()).to.emit(c, "Released");
    });

    it("release() revert si jamais claim", async () => {
      const [owner, alice, bob] = await ethers.getSigners();
      const tree = StandardMerkleTree.of([[alice.address, ONE_WTG]], ["address", "uint256"]);
      const Factory = await ethers.getContractFactory("AirdropVesting");
      const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, 0, ONE_WTG);
      await expect(c.connect(bob).release()).to.be.revertedWithCustomError(c, "NotClaimed");
    });

    it("release() revert si rien à libérer (déjà tout claim au TGE + 100 % vesté)", async () => {
      const [owner, alice] = await ethers.getSigners();
      const tree = StandardMerkleTree.of([[alice.address, 1n * ONE_WTG]], ["address", "uint256"]);
      const Factory = await ethers.getContractFactory("AirdropVesting");
      const start = BigInt(await time.latest()) + 100n;
      const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, 1n * ONE_WTG);
      await owner.sendTransaction({ to: await c.getAddress(), value: 1n * ONE_WTG });
      // Avancer après la fin du linéaire (1 an) : 100 % vesté
      await time.increaseTo(start + 365n * ONE_DAY + 1n);
      const proof = tree.getProof([alice.address, 1n * ONE_WTG]) as `0x${string}`[];
      await c.connect(alice).claim(1n * ONE_WTG, proof);
      await expect(c.connect(alice).release()).to.be.revertedWithCustomError(c, "NothingToRelease");
    });

    it("vestedAmount / getReleasable views", async () => {
      const [owner, alice] = await ethers.getSigners();
      const tree = StandardMerkleTree.of([[alice.address, ONE_WTG]], ["address", "uint256"]);
      const Factory = await ethers.getContractFactory("AirdropVesting");
      const start = BigInt(await time.latest()) + 100n;
      const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, ONE_WTG);
      // Avant claim : alloc = 0 → vestedAmount = 0
      expect(await c.vestedAmount(alice.address)).to.equal(0n);
      expect(await c.getReleasable(alice.address)).to.equal(0n);
    });

    it("pause bloque claim et release", async () => {
      const [owner, alice] = await ethers.getSigners();
      const tree = StandardMerkleTree.of([[alice.address, ONE_WTG]], ["address", "uint256"]);
      const Factory = await ethers.getContractFactory("AirdropVesting");
      const start = BigInt(await time.latest()) + 100n;
      const c = await Factory.deploy(owner.address, tree.root as `0x${string}`, start, ONE_WTG);
      await owner.sendTransaction({ to: await c.getAddress(), value: ONE_WTG });
      await c.connect(owner).pause();
      const proof = tree.getProof([alice.address, ONE_WTG]) as `0x${string}`[];
      await expect(c.connect(alice).claim(ONE_WTG, proof)).to.be.revertedWithCustomError(c, "EnforcedPause");
      await c.connect(owner).unpause();
    });
  });

  describe("WINTGTreasury — views et erreurs", () => {
    it("getTransaction & transactionsCount", async () => {
      const [s1, s2, recipient] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("WINTGTreasury");
      const m = await Factory.deploy([s1.address, s2.address], 2);

      expect(await m.transactionsCount()).to.equal(0n);
      await m.connect(s1).submit(recipient.address, 1n, "0x", 0);
      expect(await m.transactionsCount()).to.equal(1n);

      const t = await m.getTransaction(0);
      expect(t.to).to.equal(recipient.address);
      expect(t.value).to.equal(1n);

      await expect(m.getTransaction(99)).to.be.revertedWithCustomError(m, "TxNotFound");
    });

    it("submit avec to=zero revert", async () => {
      const [s1, s2] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("WINTGTreasury");
      const m = await Factory.deploy([s1.address, s2.address], 1);
      await expect(m.connect(s1).submit(ethers.ZeroAddress, 0, "0x", 0)).to.be.revertedWithCustomError(
        m,
        "ZeroAddress",
      );
    });

    it("call qui revert : execute revert", async () => {
      const [s1, s2] = await ethers.getSigners();
      const Treasury = await ethers.getContractFactory("WINTGTreasury");
      const m = await Treasury.deploy([s1.address, s2.address], 1);
      // Submit un call vers une adresse contract qui n'a pas de fallback ET avec data invalide
      const Burn = await ethers.getContractFactory("BurnContract");
      const burn = await Burn.deploy();
      // Appeler une fonction inexistante de Burn → revert
      await m.connect(s1).submit(await burn.getAddress(), 0, "0xdeadbeef", 0);
      await expect(m.connect(s1).execute(0)).to.be.revertedWithCustomError(m, "CallReverted");
    });
  });

  describe("StakingRewardsReserve — views et erreurs", () => {
    it("remainingToday() reflète la consommation et le reset 24h", async () => {
      const [owner, recipient] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("StakingRewardsReserve");
      const c = await Factory.deploy(owner.address, 1000n * ONE_WTG);
      await owner.sendTransaction({ to: await c.getAddress(), value: 1000n * ONE_WTG });

      expect(await c.remainingToday()).to.equal(10n * ONE_WTG);
      await c.connect(owner).withdraw(recipient.address, 3n * ONE_WTG);
      expect(await c.remainingToday()).to.equal(7n * ONE_WTG);

      await time.increase(ONE_DAY + 1n);
      expect(await c.remainingToday()).to.equal(10n * ONE_WTG);
    });

    it("revert sur paramètres invalides", async () => {
      const [owner, recipient] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("StakingRewardsReserve");

      await expect(Factory.deploy(owner.address, 0)).to.be.revertedWithCustomError(
        Factory,
        "ZeroAllocation",
      );

      const c = await Factory.deploy(owner.address, 1000n * ONE_WTG);
      await owner.sendTransaction({ to: await c.getAddress(), value: 1000n * ONE_WTG });

      await expect(c.connect(owner).withdraw(ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(
        c,
        "ZeroAddress",
      );
      await expect(c.connect(owner).withdraw(recipient.address, 0)).to.be.revertedWithCustomError(
        c,
        "AmountIsZero",
      );
      // Demander plus que le solde après limite (insuffisant overall)
      await expect(
        c.connect(owner).withdraw(recipient.address, 2000n * ONE_WTG),
      ).to.be.revertedWithCustomError(c, "InsufficientBalance");
    });
  });

  describe("FeeDistributor.cumulativeDistributed", () => {
    it("retourne la somme des trois flux", async () => {
      const [owner, t, v] = await ethers.getSigners();
      const Burn = await ethers.getContractFactory("BurnContract");
      const burn = await Burn.deploy();
      const Distrib = await ethers.getContractFactory("FeeDistributor");
      const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress());

      await owner.sendTransaction({ to: await d.getAddress(), value: 1000n * ONE_WTG });
      await d.distribute();
      expect(await d.cumulativeDistributed()).to.equal(1000n * ONE_WTG);
      expect(await d.pendingDistribution()).to.equal(0n);
    });

    it("setRecipients met à jour et émet RecipientsUpdated", async () => {
      const [owner, t, v, t2, v2] = await ethers.getSigners();
      const Burn = await ethers.getContractFactory("BurnContract");
      const burn = await Burn.deploy();
      const Distrib = await ethers.getContractFactory("FeeDistributor");
      const d = await Distrib.deploy(owner.address, t.address, v.address, await burn.getAddress());

      await expect(d.connect(owner).setRecipients(t2.address, v2.address, await burn.getAddress()))
        .to.emit(d, "RecipientsUpdated")
        .withArgs(t2.address, v2.address, await burn.getAddress());
      expect(await d.treasury()).to.equal(t2.address);
    });
  });
});
