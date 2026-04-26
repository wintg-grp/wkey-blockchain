/**
 * Configuration solidity-coverage
 *
 * Exclus :
 *   - governance/ : OZ Governor + Timelock pure (déjà audités par OZ)
 *   - dex/interfaces/ : interfaces sans logique
 */
module.exports = {
  skipFiles: [
    "governance/WINTGGovernor.sol",
    "governance/WINTGTimelock.sol",
    "dex/interfaces/IWINTGPair.sol",
    "dex/interfaces/IWWTG.sol",
  ],
  // Garder viaIR (sinon WINTGRouter stack-too-deep)
  configureYulOptimizer: true,
};
