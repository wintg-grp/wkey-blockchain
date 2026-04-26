/**
 * Mini-ABIs (sous-ensembles courants utilisés par le SDK).
 * Pour des intégrations avancées, importer les ABIs complets depuis
 * `contracts/artifacts/contracts/src/<...>.json`.
 */

export const ABIS = {
  WTGToken: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function deposit() payable",
    "function withdraw(uint256)",
    "function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
    "function delegate(address)",
    "function getVotes(address) view returns (uint256)",
    "event Transfer(address indexed,address indexed,uint256)",
    "event Deposit(address indexed,uint256)",
    "event Withdrawal(address indexed,uint256)",
  ],

  WINTGStaking: [
    "function stake() payable",
    "function requestUnstake(uint256)",
    "function claimUnstaked()",
    "function claimRewards()",
    "function earned(address) view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function rewardRate() view returns (uint256)",
    "function users(address) view returns (uint128 staked,uint128 pendingUnstake,uint64 unstakeReadyAt,uint256 rewardPerTokenPaid,uint256 rewards)",
    "function estimatedAprBps(uint256) view returns (uint256)",
    "event Staked(address indexed,uint256,uint256)",
    "event RewardClaimed(address indexed,uint256)",
  ],

  WINTGRouter: [
    "function factory() view returns (address)",
    "function WWTG() view returns (address)",
    "function getAmountsOut(uint256,address[]) view returns (uint256[])",
    "function getAmountsIn(uint256,address[]) view returns (uint256[])",
    "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
    "function addLiquidityWTG(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
    "function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
    "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
    "function swapExactWTGForTokens(uint256,address[],address,uint256) payable returns (uint256[])",
    "function swapExactTokensForWTG(uint256,uint256,address[],address,uint256) returns (uint256[])",
  ],

  WINTGFactory: [
    "function getPair(address,address) view returns (address)",
    "function allPairsLength() view returns (uint256)",
    "function allPairs(uint256) view returns (address)",
    "function feeTo() view returns (address)",
  ],

  WINTGGovernor: [
    "function propose(address[],uint256[],bytes[],string) returns (uint256)",
    "function castVote(uint256,uint8) returns (uint256)",
    "function execute(address[],uint256[],bytes[],bytes32) payable returns (uint256)",
    "function queue(address[],uint256[],bytes[],bytes32) returns (uint256)",
    "function state(uint256) view returns (uint8)",
    "function votingDelay() view returns (uint256)",
    "function votingPeriod() view returns (uint256)",
  ],

  WINTGBridge: [
    "function lock(uint64,address) payable",
    "function totalLocked() view returns (uint256)",
    "function relayersCount() view returns (uint256)",
    "function threshold() view returns (uint256)",
    "event Locked(address indexed,uint256,uint64 indexed,address indexed,uint256)",
  ],

  OracleAggregator: [
    "function decimals() view returns (uint8)",
    "function description() view returns (string)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  ],

  Multicall3: [
    "function aggregate((address,bytes)[]) returns (uint256,bytes[])",
    "function aggregate3((address,bool,bytes)[]) payable returns ((bool,bytes)[])",
    "function getEthBalance(address) view returns (uint256)",
    "function getBlockNumber() view returns (uint256)",
    "function getChainId() view returns (uint256)",
  ],
} as const;
