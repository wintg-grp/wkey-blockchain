// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {FeeDistributor} from "../../src/fees/FeeDistributor.sol";
import {BurnContract} from "../../src/fees/BurnContract.sol";

/**
 * @notice Invariants du FeeDistributor sous fuzzing.
 *   I1 — somme distribuée == solde initial (à 1 wei près d'arrondi vers burn)
 *   I2 — treasury reçoit exactement 70 %, validators 20 %, burn ≥ 10 %
 *   I3 — cumul des cumulatives = total distribué
 */
contract FeeDistributorFuzz is Test {
    FeeDistributor internal d;
    BurnContract internal burn;
    address payable internal treasury = payable(address(0xCAFE));
    address payable internal validators = payable(address(0xBEEF));
    address internal owner = address(0xA);

    function setUp() public {
        burn = new BurnContract();
        d = new FeeDistributor(owner, treasury, validators, payable(address(burn)));
    }

    function testFuzz_Distribution(uint256 amount) public {
        amount = bound(amount, 1 ether, 10_000 ether);
        vm.deal(address(d), amount);

        uint256 tBefore = treasury.balance;
        uint256 vBefore = validators.balance;
        uint256 bBefore = address(burn).balance;

        d.distribute();

        uint256 tDelta = treasury.balance - tBefore;
        uint256 vDelta = validators.balance - vBefore;
        uint256 bDelta = address(burn).balance - bBefore;

        // I2 — proportions exactes (les arrondis vont au burn)
        assertEq(tDelta, (amount * 7000) / 10_000, "treasury share");
        assertEq(vDelta, (amount * 2000) / 10_000, "validators share");
        assertGe(bDelta, (amount * 1000) / 10_000, "burn share min");

        // I1 — somme = total
        assertEq(tDelta + vDelta + bDelta, amount, "sum = total");

        // I3 — cumulatives consistantes
        assertEq(d.cumulativeToTreasury(), tDelta);
        assertEq(d.cumulativeToValidators(), vDelta);
        assertEq(d.cumulativeToBurn(), bDelta);
    }
}
