// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingVault} from "./VestingVault.sol";

/**
 * @title  PartnersVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Partenariats Institutionnels (2 % du supply,
 *         20 M WTG). Destinée aux UCAO, banques, régulateurs et autres
 *         partenaires stratégiques.
 *         - 0 % au TGE
 *         - Cliff de 6 mois (180 jours)
 *         - 100 % linéaire sur 24 mois (730 jours) après le cliff
 *         - **Non-révocable** : engagement contractuel ferme.
 */
contract PartnersVesting is VestingVault {
    uint64 public constant PT_CLIFF = 180 days;
    uint64 public constant PT_LINEAR = 2 * 365 days;     // 24 mois
    uint256 public constant PT_TGE = 0;
    bool public constant PT_REVOCABLE = false;

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
            PT_CLIFF,
            PT_LINEAR,
            PT_TGE,
            totalAllocation_,
            PT_REVOCABLE
        )
    {}
}
