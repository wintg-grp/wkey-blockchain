// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingVault} from "./VestingVault.sol";

/**
 * @title  EcosystemVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Écosystème & Grants (20 % du supply, 200 M WTG).
 *         - 5 % au TGE (= 10 000 000 WTG sur 200 000 000)
 *         - Pas de cliff
 *         - 95 % restant linéaire sur 48 mois (4 ans = 1460 jours)
 *         - **Non-révocable** : la tranche écosystème est inscrite.
 *         L'owner = multisig autorise les grants au fil de l'eau via le
 *         `release()` standard (les fonds vont sur le wallet bénéficiaire =
 *         multisig écosystème).
 */
contract EcosystemVesting is VestingVault {
    uint64 public constant ECO_CLIFF = 0;
    uint64 public constant ECO_LINEAR = 4 * 365 days;     // 48 mois
    bool public constant ECO_REVOCABLE = false;
    /// @notice 5 % du total est libéré au TGE.
    uint16 public constant ECO_TGE_BPS = 500;

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
            ECO_CLIFF,
            ECO_LINEAR,
            (totalAllocation_ * ECO_TGE_BPS) / 10_000,
            totalAllocation_,
            ECO_REVOCABLE
        )
    {}
}
