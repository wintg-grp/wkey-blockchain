export interface WintgContracts {
  WTGToken: string;
  WINTGTreasury: string;
  FeeDistributor: string;
  BurnContract: string;
  StakingRewardsReserve: string;
  WINTGStaking: string;
  WINTGGovernor: string;
  WINTGTimelock: string;
  WINTGFactory: string;
  WINTGRouter: string;
  WINTGBridge: string;
  OracleAggregator: string;
  Multicall3: string;
  ValidatorRegistry: string;
  PublicSaleVesting: string;
  PrivateSaleVesting: string;
  TeamVesting: string;
  AdvisorsVesting: string;
  EcosystemVesting: string;
  AirdropVesting: string;
  TreasuryVesting: string;
  PartnersVesting: string;
}

export interface WintgNetwork {
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  explorerUrl: string;
  symbol: "WTG";
  contracts: WintgContracts;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Mainnet WINTG (chainId 2280).
 * Les adresses sont remplies après déploiement (`contracts/deployments/wintgMainnet.json`).
 */
export const MAINNET: WintgNetwork = {
  name: "WINTG",
  chainId: 2280,
  rpcUrl: "https://rpc.wintg.network",
  wsUrl: "wss://ws.wintg.network",
  explorerUrl: "https://scan.wintg.network",
  symbol: "WTG",
  contracts: {
    WTGToken: ZERO,
    WINTGTreasury: ZERO,
    FeeDistributor: ZERO,
    BurnContract: ZERO,
    StakingRewardsReserve: ZERO,
    WINTGStaking: ZERO,
    WINTGGovernor: ZERO,
    WINTGTimelock: ZERO,
    WINTGFactory: ZERO,
    WINTGRouter: ZERO,
    WINTGBridge: ZERO,
    OracleAggregator: ZERO,
    Multicall3: ZERO,
    ValidatorRegistry: ZERO,
    PublicSaleVesting: ZERO,
    PrivateSaleVesting: ZERO,
    TeamVesting: ZERO,
    AdvisorsVesting: ZERO,
    EcosystemVesting: ZERO,
    AirdropVesting: ZERO,
    TreasuryVesting: ZERO,
    PartnersVesting: ZERO,
  },
};

export const TESTNET: WintgNetwork = {
  ...MAINNET,
  name: "WINTG Testnet",
  chainId: 22800,
  rpcUrl: "https://testnet-rpc.wintg.network",
  wsUrl: "wss://testnet-ws.wintg.network",
  explorerUrl: "https://testnet-scan.wintg.network",
};

export const NETWORKS = { mainnet: MAINNET, testnet: TESTNET } as const;
