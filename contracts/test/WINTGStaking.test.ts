import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_WTG = 10n ** 18n;
const RESERVE_TOTAL = 1000n * ONE_WTG;

beforeEach(async () => {
  await network.provider.send("hardhat_reset");
});

/**
 * Déploie Reserve + Staking en utilisant CREATE address pré-calculée :
 * la Reserve doit être ownée par le Staking, mais le Staking n'existe pas
 * encore. Solution : calculer l'adresse future du Staking, déployer la
 * Reserve avec ce owner, puis déployer le Staking.
 */
async function deployFixture(rewardRate: bigint = ONE_WTG / 10n) {
  const [owner, alice, bob] = await ethers.getSigners();
  const ownerNonce = await ethers.provider.getTransactionCount(owner.address);
  // Reserve = nonce N, Staking = nonce N+1 (approximation : send tx pour funder reserve aussi)
  // Plus robuste : déployer tout en chaîne sans tx intermédiaire
  // Reserve déploiement = nonce N → Staking déploiement = nonce N+1 (skip funding tx)

  // On va d'abord déployer Staking avec une address dummy de Reserve, puis re-déployer
  // proprement. Ou mieux : utiliser une nouvelle approche en redéployant tout dans
  // l'ordre prévu : Reserve(N) → Staking(N+1) avec stakingFutureAddr connue.

  const stakingFutureAddr = ethers.getCreateAddress({
    from: owner.address,
    nonce: ownerNonce + 1,
  });

  const Reserve = await ethers.getContractFactory("StakingRewardsReserve");
  const reserve = await Reserve.deploy(stakingFutureAddr, RESERVE_TOTAL);
  await reserve.waitForDeployment();

  const Staking = await ethers.getContractFactory("WINTGStaking");
  const staking = await Staking.deploy(
    owner.address,
    await reserve.getAddress(),
    rewardRate,
    3600n,
  );
  await staking.waitForDeployment();
  expect(await staking.getAddress()).to.equal(stakingFutureAddr);

  // Funder la reserve depuis bob (pour préserver le solde d'owner)
  await bob.sendTransaction({ to: await reserve.getAddress(), value: RESERVE_TOTAL });

  return { staking, reserve, owner, alice, bob };
}

describe("WINTGStaking", () => {
  it("stake → earn → claim", async () => {
    const { staking, alice } = await deployFixture();

    await staking.connect(alice).stake({ value: 10n * ONE_WTG });
    expect(await staking.totalStaked()).to.equal(10n * ONE_WTG);

    // Avancer 50s seulement pour rester sous le dailyLimit (1% de 1000 = 10 WTG/jour)
    await time.increase(50);
    const earned = await staking.earned(alice.address);
    // 0.1 WTG/sec * 50s = 5 WTG, sous la limite
    expect(earned).to.be.closeTo(5n * ONE_WTG, ONE_WTG / 10n);

    await staking.connect(alice).claimRewards();
    expect(await staking.earned(alice.address)).to.be.lt(ONE_WTG / 100n);
  });

  it("requestUnstake + cooldown + claimUnstaked", async () => {
    const { staking, alice } = await deployFixture();

    await staking.connect(alice).stake({ value: 10n * ONE_WTG });
    await staking.connect(alice).requestUnstake(5n * ONE_WTG);

    await expect(staking.connect(alice).claimUnstaked()).to.be.revertedWithCustomError(
      staking,
      "CooldownActive",
    );

    await time.increase(3601);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await staking.connect(alice).claimUnstaked();
    const r = await tx.wait();
    const gas = r!.gasUsed * r!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.equal(5n * ONE_WTG);
  });

  it("multi-staker : récompenses pro-rata", async () => {
    const { staking, alice, bob } = await deployFixture();

    await staking.connect(alice).stake({ value: 30n * ONE_WTG });
    await staking.connect(bob).stake({ value: 70n * ONE_WTG });

    await time.increase(100);
    const aEarned = await staking.earned(alice.address);
    const bEarned = await staking.earned(bob.address);

    expect(aEarned).to.be.closeTo(3n * ONE_WTG, ONE_WTG / 10n);
    expect(bEarned).to.be.closeTo(7n * ONE_WTG, ONE_WTG / 10n);
  });

  it("setRewardRate respecte le plafond", async () => {
    const { staking, owner } = await deployFixture();
    const MAX = await staking.MAX_REWARD_RATE();
    await expect(staking.connect(owner).setRewardRate(MAX + 1n)).to.be.revertedWithCustomError(
      staking,
      "RewardRateTooHigh",
    );
    await staking.connect(owner).setRewardRate(MAX);
  });

  it("APR estimé > 0", async () => {
    const { staking, alice } = await deployFixture();
    await staking.connect(alice).stake({ value: 1n * ONE_WTG });
    const apr = await staking.estimatedAprBps(0);
    expect(apr).to.be.gt(0n);
  });

  it("stake 0 revert", async () => {
    const { staking, alice } = await deployFixture();
    await expect(staking.connect(alice).stake({ value: 0 })).to.be.revertedWithCustomError(
      staking,
      "ZeroAmount",
    );
  });

  it("requestUnstake > staked revert", async () => {
    const { staking, alice } = await deployFixture();
    await staking.connect(alice).stake({ value: ONE_WTG });
    await expect(
      staking.connect(alice).requestUnstake(2n * ONE_WTG),
    ).to.be.revertedWithCustomError(staking, "InsufficientStake");
  });
});
