import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { VestingVault } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const ONE_DAY = 86_400n;
const ONE_MONTH = 30n * ONE_DAY;
const ONE_WTG = 10n ** 18n;

/**
 * Déploie un VestingVault et lui envoie `totalAllocation` en ETH (= WTG natif
 * sur la testnet locale Hardhat).
 */
async function deployVault(params: {
  owner: HardhatEthersSigner;
  beneficiary: HardhatEthersSigner;
  startDelay: bigint;        // secondes après le block.timestamp courant
  cliffSeconds: bigint;
  linearDurationSeconds: bigint;
  tgeAmount: bigint;
  totalAllocation: bigint;
  revocable: boolean;
}) {
  const Factory = await ethers.getContractFactory("VestingVault");
  const start = BigInt(await time.latest()) + params.startDelay;

  const vault = (await Factory.deploy(
    params.owner.address,
    params.beneficiary.address,
    start,
    params.cliffSeconds,
    params.linearDurationSeconds,
    params.tgeAmount,
    params.totalAllocation,
    params.revocable,
  )) as unknown as VestingVault;
  await vault.waitForDeployment();

  // Pré-financer le coffre comme le ferait le Genesis
  await params.owner.sendTransaction({
    to: await vault.getAddress(),
    value: params.totalAllocation,
  });

  return { vault, start };
}

describe("VestingVault", () => {
  let owner: HardhatEthersSigner;
  let beneficiary: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, beneficiary, stranger] = await ethers.getSigners();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe("Constructor", () => {
    it("rejette beneficiary == zero", async () => {
      const Factory = await ethers.getContractFactory("VestingVault");
      await expect(
        Factory.deploy(
          owner.address,
          ethers.ZeroAddress,
          0,
          0,
          ONE_MONTH,
          0,
          10n * ONE_WTG,
          false,
        ),
      ).to.be.revertedWithCustomError(Factory, "ZeroBeneficiary");
    });

    it("rejette totalAllocation == 0", async () => {
      const Factory = await ethers.getContractFactory("VestingVault");
      await expect(
        Factory.deploy(owner.address, beneficiary.address, 0, 0, ONE_MONTH, 0, 0, false),
      ).to.be.revertedWithCustomError(Factory, "ZeroAllocation");
    });

    it("rejette tgeAmount > totalAllocation", async () => {
      const Factory = await ethers.getContractFactory("VestingVault");
      await expect(
        Factory.deploy(
          owner.address,
          beneficiary.address,
          0,
          0,
          ONE_MONTH,
          1001n * ONE_WTG,
          10n * ONE_WTG,
          false,
        ),
      ).to.be.revertedWithCustomError(Factory, "TgeExceedsAllocation");
    });

    it("rejette une durée totale dépassant 10 ans", async () => {
      const Factory = await ethers.getContractFactory("VestingVault");
      const elevenYears = 11n * 365n * ONE_DAY;
      await expect(
        Factory.deploy(
          owner.address,
          beneficiary.address,
          0,
          0,
          elevenYears,
          0,
          10n * ONE_WTG,
          false,
        ),
      ).to.be.revertedWithCustomError(Factory, "CliffOrDurationTooLong");
    });

    it("expose les paramètres en immutables", async () => {
      const total = 10n * ONE_WTG;
      const tge = 1n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 0n,
        cliffSeconds: 30n * ONE_DAY,
        linearDurationSeconds: 180n * ONE_DAY,
        tgeAmount: tge,
        totalAllocation: total,
        revocable: true,
      });

      expect(await vault.beneficiary()).to.equal(beneficiary.address);
      expect(await vault.start()).to.equal(start);
      expect(await vault.cliff()).to.equal(30n * ONE_DAY);
      expect(await vault.linearDuration()).to.equal(180n * ONE_DAY);
      expect(await vault.tgeAmount()).to.equal(tge);
      expect(await vault.totalAllocation()).to.equal(total);
      expect(await vault.revocable()).to.be.true;
      expect(await vault.released()).to.equal(0n);
      expect(await vault.revoked()).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // Schedule (TGE + cliff + linear)
  // ---------------------------------------------------------------------------

  describe("Vesting schedule", () => {
    it("0 vesté avant start", async () => {
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 100n,
        cliffSeconds: 0n,
        linearDurationSeconds: ONE_MONTH,
        tgeAmount: 1n * ONE_WTG,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      expect(await vault.vestedAmount(start - 1n)).to.equal(0n);
      expect(await vault.getReleasable()).to.equal(0n);
    });

    it("tgeAmount disponible immédiatement à start", async () => {
      const tge = 1n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: tge,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      await time.increaseTo(start);
      expect(await vault.vestedAmount(start)).to.equal(tge);
      expect(await vault.getReleasable()).to.equal(tge);
    });

    it("rien ne se libère pendant le cliff (au-delà du TGE)", async () => {
      const tge = 1n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: tge,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      await time.increaseTo(start + ONE_MONTH / 2n);
      expect(await vault.getReleasable()).to.equal(tge);
    });

    it("vesting linéaire au prorata après le cliff", async () => {
      const tge = 1n * ONE_WTG;
      const total = 10n * ONE_WTG;
      const linearPortion = total - tge;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: tge,
        totalAllocation: total,
        revocable: false,
      });
      // À la moitié du linéaire : tge + (linearPortion / 2)
      const halfLinear = start + ONE_MONTH + 3n * ONE_MONTH;
      await time.increaseTo(halfLinear);
      const expected = tge + linearPortion / 2n;
      expect(await vault.getReleasable()).to.be.closeTo(expected, ONE_WTG / 100n);
    });

    it("100 % vesté à la fin", async () => {
      const total = 10n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: 1n * ONE_WTG,
        totalAllocation: total,
        revocable: false,
      });
      await time.increaseTo(start + ONE_MONTH + 6n * ONE_MONTH + 1n);
      expect(await vault.vestedAmount(BigInt(await time.latest()))).to.equal(total);
      expect(await vault.getReleasable()).to.equal(total);
    });
  });

  // ---------------------------------------------------------------------------
  // release()
  // ---------------------------------------------------------------------------

  describe("release()", () => {
    it("transfère les WTG vestés au bénéficiaire et émet TokensReleased", async () => {
      const tge = 1n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: tge,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      await time.increaseTo(start);

      const before = await ethers.provider.getBalance(beneficiary.address);
      await expect(vault.connect(stranger).release())
        .to.emit(vault, "TokensReleased")
        .withArgs(beneficiary.address, tge);
      const after = await ethers.provider.getBalance(beneficiary.address);

      // Le bénéficiaire reçoit `tge` (note : c'est `stranger` qui paie le gas)
      expect(after - before).to.equal(tge);
      expect(await vault.released()).to.equal(tge);
    });

    it("revert si rien à libérer", async () => {
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 100n,
        cliffSeconds: 0n,
        linearDurationSeconds: ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      await time.increaseTo(start - 50n);
      await expect(vault.release()).to.be.revertedWithCustomError(vault, "NothingToRelease");
    });

    it("ne libère jamais plus que totalAllocation au cumul", async () => {
      const total = 10n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: 0n,
        linearDurationSeconds: ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: total,
        revocable: false,
      });

      // Plusieurs releases au cours du temps : 4 paliers de 25 %
      for (let i = 1n; i <= 4n; i++) {
        await time.increaseTo(start + (ONE_MONTH * i) / 4n);
        await vault.release();
      }
      expect(await vault.released()).to.equal(total);

      // Plus rien à libérer (même bien après la fin)
      await time.increaseTo(start + 2n * ONE_MONTH);
      await expect(vault.release()).to.be.revertedWithCustomError(vault, "NothingToRelease");
    });
  });

  // ---------------------------------------------------------------------------
  // revoke()
  // ---------------------------------------------------------------------------

  describe("revoke()", () => {
    it("revert si non-revocable", async () => {
      const { vault } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: 10n * ONE_WTG,
        revocable: false,
      });
      await expect(vault.connect(owner).revoke()).to.be.revertedWithCustomError(vault, "NotRevocable");
    });

    it("revert si appelé par autre que l'owner", async () => {
      const { vault } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: 10n * ONE_WTG,
        revocable: true,
      });
      await expect(vault.connect(stranger).revoke()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount",
      );
    });

    it("renvoie le non-vesté à l'owner et conserve le vesté pour le bénéficiaire", async () => {
      const total = 10n * ONE_WTG;
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: ONE_MONTH,
        linearDurationSeconds: 6n * ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: total,
        revocable: true,
      });
      // À mi-parcours du linéaire : 50% vesté
      const halfLinear = start + ONE_MONTH + 3n * ONE_MONTH;
      await time.increaseTo(halfLinear);

      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await vault.connect(owner).revoke();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      // Owner reçoit ~50% (le non-vesté)
      const ownerReceived = ownerAfter - ownerBefore + gasUsed;
      expect(ownerReceived).to.be.closeTo(total / 2n, ONE_WTG / 100n);

      expect(await vault.revoked()).to.be.true;

      // Bénéficiaire peut toujours réclamer la portion vestée
      const benefBefore = await ethers.provider.getBalance(beneficiary.address);
      await vault.connect(stranger).release();
      const benefAfter = await ethers.provider.getBalance(beneficiary.address);
      expect(benefAfter - benefBefore).to.be.closeTo(total / 2n, ONE_WTG / 100n);

      // Le coffre est vide
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.be.lt(ONE_WTG / 1000n);
    });

    it("ne peut être révoqué qu'une fois", async () => {
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: 0n,
        linearDurationSeconds: ONE_MONTH,
        tgeAmount: 0n,
        totalAllocation: 10n * ONE_WTG,
        revocable: true,
      });
      await time.increaseTo(start);
      await vault.connect(owner).revoke();
      await expect(vault.connect(owner).revoke()).to.be.revertedWithCustomError(vault, "AlreadyRevoked");
    });
  });

  // ---------------------------------------------------------------------------
  // pause / unpause
  // ---------------------------------------------------------------------------

  describe("pause()", () => {
    it("bloque release() pendant la pause, pas revoke()", async () => {
      const { vault, start } = await deployVault({
        owner,
        beneficiary,
        startDelay: 10n,
        cliffSeconds: 0n,
        linearDurationSeconds: ONE_MONTH,
        tgeAmount: 1n * ONE_WTG,
        totalAllocation: 10n * ONE_WTG,
        revocable: true,
      });
      await time.increaseTo(start);
      await vault.connect(owner).pause();

      await expect(vault.release()).to.be.revertedWithCustomError(vault, "EnforcedPause");
      // Revoke doit toujours fonctionner pour permettre la récupération en urgence
      await expect(vault.connect(owner).revoke()).to.not.be.reverted;

      await vault.connect(owner).unpause();
      // Le bénéficiaire peut récupérer la portion vestée pré-revoke
      await expect(vault.release()).to.not.be.reverted;
    });
  });
});
