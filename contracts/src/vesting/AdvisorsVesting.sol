// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingVault} from "./VestingVault.sol";

/**
 * @title  AdvisorsVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Advisors (3 % du supply, 30 M WTG).
 *         - 0 % au TGE
 *         - Cliff de 6 mois (180 jours)
 *         - 100 % linéaire sur 18 mois (540 jours) après le cliff
 *         - Total : 2 ans
 *         - **Révocable** (l'advisor sortant peut être coupé).
 */
contract AdvisorsVesting is VestingVault {
    uint64 public constant ADV_CLIFF = 180 days;
    uint64 public constant ADV_LINEAR = 540 days;
    uint256 public constant ADV_TGE = 0;
    bool public constant ADV_REVOCABLE = true;

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
            ADV_CLIFF,
            ADV_LINEAR,
            ADV_TGE,
            totalAllocation_,
            ADV_REVOCABLE
        )
    {}
}
