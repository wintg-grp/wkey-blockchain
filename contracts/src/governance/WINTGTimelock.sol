// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title  WINTGTimelock
 * @author WINTG Team
 * @notice Timelock standard OpenZeppelin pour la gouvernance WINTG.
 *         Toutes les opérations de gouvernance passent par ce timelock :
 *         délai minimum entre l'approbation d'une proposition et son exécution.
 *
 *         Recommandation production :
 *           - `minDelay = 2 days` pour les modifs sensibles (rewardRate, etc.)
 *           - `proposers = [WINTGGovernor]`
 *           - `executors = [address(0)]` (open execution = anyone peut exécuter
 *             une proposition acceptée après le délai)
 *           - `admin = address(0)` (renoncer post-bootstrap pour décentraliser)
 */
contract WINTGTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
