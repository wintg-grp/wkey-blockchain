import { Contract, type ContractRunner } from "ethers";
import type { WintgNetwork } from "../networks.js";
import { ABIS } from "../abis.js";

export const VOTE = { Against: 0, For: 1, Abstain: 2 } as const;
export type VoteSupport = (typeof VOTE)[keyof typeof VOTE];

export const PROPOSAL_STATE = {
  Pending: 0, Active: 1, Canceled: 2, Defeated: 3,
  Succeeded: 4, Queued: 5, Expired: 6, Executed: 7,
} as const;

export class GovernanceAdapter {
  constructor(private runner: ContractRunner, private network: WintgNetwork) {}

  private contract(runner?: ContractRunner) {
    return new Contract(this.network.contracts.WINTGGovernor, ABIS.WINTGGovernor, runner ?? this.runner);
  }

  async propose(
    wallet: ContractRunner,
    targets: string[],
    values: bigint[],
    calldatas: string[],
    description: string,
  ): Promise<unknown> {
    return this.contract(wallet).propose(targets, values, calldatas, description);
  }

  async castVote(wallet: ContractRunner, proposalId: bigint, support: VoteSupport): Promise<unknown> {
    return this.contract(wallet).castVote(proposalId, support);
  }

  async getState(proposalId: bigint): Promise<number> {
    return Number(await this.contract().state(proposalId));
  }

  async votingDelay(): Promise<bigint> {
    return this.contract().votingDelay();
  }

  async votingPeriod(): Promise<bigint> {
    return this.contract().votingPeriod();
  }
}
