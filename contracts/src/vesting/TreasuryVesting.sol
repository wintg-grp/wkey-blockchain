// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingVault} from "./VestingVault.sol";

/**
 * @title  TreasuryVesting
 * @author WINTG Team
 * @notice Vesting de la Trésorerie WINTG (10 % du supply, 100 M WTG).
 *         - 10 % au TGE (= 10 M WTG)
 *         - Cliff de 6 mois (180 jours)
 *         - 90 % linéaire sur 48 mois (1460 jours) après le cliff
 *         - **Non-révocable** : la trésorerie est protégée.
 *         Le bénéficiaire est obligatoirement le contrat `WINTGTreasury`
 *         (multisig 2-of-3 ou 3-of-5).
 */
contract TreasuryVesting is VestingVault {
    uint64 public constant TR_CLIFF = 180 days;
    uint64 public constant TR_LINEAR = 4 * 365 days;     // 48 mois
    bool public constant TR_REVOCABLE = false;
    /// @notice 10 % du total est libéré au TGE.
    uint16 public constant TR_TGE_BPS = 1000;

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
            TR_CLIFF,
            TR_LINEAR,
            (totalAllocation_ * TR_TGE_BPS) / 10_000,
            totalAllocation_,
            TR_REVOCABLE
        )
    {}
}
