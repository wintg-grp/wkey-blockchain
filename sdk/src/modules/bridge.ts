import { Contract, type ContractRunner } from "ethers";
import type { WintgNetwork } from "../networks.js";
import { ABIS } from "../abis.js";

export class BridgeAdapter {
  constructor(private runner: ContractRunner, private network: WintgNetwork) {}

  private contract(runner?: ContractRunner) {
    return new Contract(this.network.contracts.WINTGBridge, ABIS.WINTGBridge, runner ?? this.runner);
  }

  /// @notice Lock du WTG natif vers une adresse sur la chaîne destination.
  async lock(
    wallet: ContractRunner,
    destChainId: number,
    destRecipient: string,
    amount: bigint,
  ): Promise<unknown> {
    return this.contract(wallet).lock(destChainId, destRecipient, { value: amount });
  }

  async totalLocked(): Promise<bigint> {
    return this.contract().totalLocked();
  }

  async threshold(): Promise<bigint> {
    return this.contract().threshold();
  }
}
