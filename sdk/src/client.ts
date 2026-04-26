import { JsonRpcProvider, formatEther } from "ethers";
import { MAINNET, TESTNET, type WintgNetwork } from "./networks.js";
import { DexAdapter } from "./modules/dex.js";
import { StakingAdapter } from "./modules/staking.js";
import { GovernanceAdapter } from "./modules/governance.js";
import { BridgeAdapter } from "./modules/bridge.js";
import { OracleAdapter } from "./modules/oracle.js";

export interface BalanceResult {
  raw: bigint;
  formatted: string;
  symbol: "WTG";
}

export class WintgClient {
  readonly network: WintgNetwork;
  readonly provider: JsonRpcProvider;

  readonly dex: DexAdapter;
  readonly staking: StakingAdapter;
  readonly governance: GovernanceAdapter;
  readonly bridge: BridgeAdapter;
  readonly oracle: OracleAdapter;

  constructor(network: WintgNetwork, providerOverride?: JsonRpcProvider) {
    this.network = network;
    this.provider = providerOverride ?? new JsonRpcProvider(network.rpcUrl);

    this.dex        = new DexAdapter(this.provider, network);
    this.staking    = new StakingAdapter(this.provider, network);
    this.governance = new GovernanceAdapter(this.provider, network);
    this.bridge     = new BridgeAdapter(this.provider, network);
    this.oracle     = new OracleAdapter(this.provider, network);
  }

  static mainnet(): WintgClient { return new WintgClient(MAINNET); }
  static testnet(): WintgClient { return new WintgClient(TESTNET); }

  async getChainId(): Promise<number> {
    return Number((await this.provider.getNetwork()).chainId);
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getBalance(address: string): Promise<BalanceResult> {
    const raw = await this.provider.getBalance(address);
    return { raw, formatted: formatEther(raw), symbol: "WTG" };
  }

  async getGasPrice(): Promise<bigint> {
    const fee = await this.provider.getFeeData();
    return fee.gasPrice ?? 0n;
  }
}
