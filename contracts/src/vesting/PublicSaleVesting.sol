// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SaleVestingBase} from "./SaleVestingBase.sol";

/**
 * @title  PublicSaleVesting
 * @author WINTG Team
 * @notice Vesting de la tranche Public Sale (ICO/IDO) — 12 % du supply,
 *         120 M WTG.
 *         - 25 % débloqué au TGE
 *         - Pas de cliff
 *         - 75 % linéaire sur 6 mois (180 jours)
 */
contract PublicSaleVesting is SaleVestingBase {
    uint16 public constant PUBLIC_TGE_BPS = 2_500;        // 25 %
    uint64 public constant PUBLIC_CLIFF = 0;
    uint64 public constant PUBLIC_LINEAR = 180 days;

    constructor(address initialOwner_, uint64 start_, uint256 cap_)
        SaleVestingBase(initialOwner_, start_, cap_)
    {}

    function tgeBps() public pure override returns (uint16) {
        return PUBLIC_TGE_BPS;
    }

    function cliffDuration() public pure override returns (uint64) {
        return PUBLIC_CLIFF;
    }

    function linearDuration() public pure override returns (uint64) {
        return PUBLIC_LINEAR;
    }
}
