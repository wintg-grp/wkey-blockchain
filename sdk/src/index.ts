/**
 * @wintg/sdk — Official TypeScript SDK for the WINTG blockchain
 *
 * @example Quick start
 * ```ts
 * import { WintgClient } from "@wintg/sdk";
 *
 * const client = WintgClient.mainnet();
 * const balance = await client.getBalance("0xabc...");
 * console.log(balance.formatted, "WTG");
 *
 * // Swap WTG → TokenB via DEX
 * await client.dex.swapExactWTGForTokens({
 *   amountIn: parseEther("1"),
 *   minOut: 0n,
 *   path: [client.networks.mainnet.contracts.WTGToken, "0xTOKEN_B"],
 *   wallet: signer,
 * });
 * ```
 */

export { WintgClient } from "./client.js";
export { NETWORKS, MAINNET, TESTNET } from "./networks.js";
export type { WintgNetwork, WintgContracts } from "./networks.js";
export { ABIS } from "./abis.js";

// Sub-modules
export { DexAdapter } from "./modules/dex.js";
export { StakingAdapter } from "./modules/staking.js";
export { GovernanceAdapter } from "./modules/governance.js";
export { BridgeAdapter } from "./modules/bridge.js";
export { OracleAdapter } from "./modules/oracle.js";

// Helpers
export {
  parseWtg,
  formatWtg,
  isWintgAddress,
  toChecksumAddress,
} from "./utils.js";
