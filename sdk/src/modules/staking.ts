import { Contract, type ContractRunner } from "ethers";
import type { WintgNetwork } from "../networks.js";
import { ABIS } from "../abis.js";

export class StakingAdapter {
  constructor(private runner: ContractRunner, private network: WintgNetwork) {}

  private contract(runner?: ContractRunner) {
    return new Contract(this.network.contracts.WINTGStaking, ABIS.WINTGStaking, runner ?? this.runner);
  }

  async stake(wallet: ContractRunner, amount: bigint): Promise<unknown> {
    return this.contract(wallet).stake({ value: amount });
  }

  async requestUnstake(wallet: ContractRunner, amount: bigint): Promise<unknown> {
    return this.contract(wallet).requestUnstake(amount);
  }

  async claimUnstaked(wallet: ContractRunner): Promise<unknown> {
    return this.contract(wallet).claimUnstaked();
  }

  async claimRewards(wallet: ContractRunner): Promise<unknown> {
    return this.contract(wallet).claimRewards();
  }

  async earned(account: string): Promise<bigint> {
    return this.contract().earned(account);
  }

  async totalStaked(): Promise<bigint> {
    return this.contract().totalStaked();
  }

  /// @returns APR estimé en basis points (10000 = 100%).
  async estimatedAprBps(additionalStake: bigint = 0n): Promise<bigint> {
    return this.contract().estimatedAprBps(additionalStake);
  }
}
