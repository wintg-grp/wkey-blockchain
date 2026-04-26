// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingVault} from "./VestingVault.sol";

/**
 * @title  TeamVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Équipe & Fondateurs (15 % du supply, 150 M WTG).
 *         - 0 % au TGE
 *         - Cliff strict de 12 mois (365 jours)
 *         - 100 % linéaire sur 36 mois (3 × 365 jours) après le cliff
 *         - Total : 4 ans de vesting
 *         - **Révocable** (l'owner = multisig peut récupérer le non-vesté).
 */
contract TeamVesting is VestingVault {
    uint64 public constant TEAM_CLIFF = 365 days;       // 12 mois
    uint64 public constant TEAM_LINEAR = 3 * 365 days;  // 36 mois
    uint256 public constant TEAM_TGE = 0;
    bool public constant TEAM_REVOCABLE = true;

    constructor(
        address initialOwner_,
        address beneficiary_,
        uint64 start_,
        uint256 totalAllocation_
    )
        VestingVault(
            initialOwner_,
            beneficiary_,
            start_,
            TEAM_CLIFF,
            TEAM_LINEAR,
            TEAM_TGE,
            totalAllocation_,
            TEAM_REVOCABLE
        )
    {}
}
