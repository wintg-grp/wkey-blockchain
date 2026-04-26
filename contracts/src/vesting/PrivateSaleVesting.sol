// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SaleVestingBase} from "./SaleVestingBase.sol";

/**
 * @title  PrivateSaleVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Private Sale (Seed) — 8 % du supply, 80 M WTG.
 *         - 10 % débloqué au TGE
 *         - Cliff de 3 mois (90 jours) où rien ne se libère en plus
 *         - 90 % linéaire sur 18 mois (540 jours) après le cliff
 */
contract PrivateSaleVesting is SaleVestingBase {
    uint16 public constant PRIVATE_TGE_BPS = 1_000;       // 10 %
    uint64 public constant PRIVATE_CLIFF = 90 days;
    uint64 public constant PRIVATE_LINEAR = 540 days;

    constructor(address initialOwner_, uint64 start_, uint256 cap_)
        SaleVestingBase(initialOwner_, start_, cap_)
    {}

    function tgeBps() public pure override returns (uint16) {
        return PRIVATE_TGE_BPS;
    }

    function cliffDuration() public pure override returns (uint64) {
        return PRIVATE_CLIFF;
    }

    function linearDuration() public pure override returns (uint64) {
        return PRIVATE_LINEAR;
    }
}
