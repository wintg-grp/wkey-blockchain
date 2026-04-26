import { Contract, type ContractRunner } from "ethers";
import type { WintgNetwork } from "../networks.js";
import { ABIS } from "../abis.js";

export interface OracleRound {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
}

export class OracleAdapter {
  constructor(private runner: ContractRunner, private network: WintgNetwork) {}

  private contract(address?: string) {
    return new Contract(
      address ?? this.network.contracts.OracleAggregator,
      ABIS.OracleAggregator,
      this.runner,
    );
  }

  async latestRoundData(oracleAddress?: string): Promise<OracleRound> {
    const r = await this.contract(oracleAddress).latestRoundData();
    return {
      roundId: r[0],
      answer: r[1],
      startedAt: r[2],
      updatedAt: r[3],
      answeredInRound: r[4],
    };
  }

  async decimals(oracleAddress?: string): Promise<number> {
    return Number(await this.contract(oracleAddress).decimals());
  }
}
