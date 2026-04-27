// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {FeeDistributor} from "../../src/fees/FeeDistributor.sol";
import {BurnContract} from "../../src/fees/BurnContract.sol";

/**
 * @notice Fuzz invariants for FeeDistributor under the 40/50/5/5 split.
 *   I1 — sum of distributed deltas == initial balance
 *   I2 — treasury 40 %, validators 50 %, burn 5 %, community ≥ 5 %
 *   I3 — cumulative counters track the deltas
 */
contract FeeDistributorFuzz is Test {
    FeeDistributor internal d;
    BurnContract internal burn;
    address payable internal treasury  = payable(address(0xCAFE));
    address payable internal validators = payable(address(0xBEEF));
    address payable internal community = payable(address(0xDEAD));
    address internal owner = address(0xA);

    function setUp() public {
        burn = new BurnContract();
        d = new FeeDistributor(owner, treasury, validators, payable(address(burn)), community);
    }

    function testFuzz_Distribution(uint256 amount) public {
        amount = bound(amount, 1 ether, 10_000 ether);
        vm.deal(address(d), amount);

        uint256 tBefore = treasury.balance;
        uint256 vBefore = validators.balance;
        uint256 bBefore = address(burn).balance;
        uint256 cBefore = community.balance;

        d.distribute();

        uint256 tDelta = treasury.balance - tBefore;
        uint256 vDelta = validators.balance - vBefore;
        uint256 bDelta = address(burn).balance - bBefore;
        uint256 cDelta = community.balance - cBefore;

        // I2 — exact proportions (rounding goes into community)
        assertEq(tDelta, (amount * 4000) / 10_000, "treasury share");
        assertEq(vDelta, (amount * 5000) / 10_000, "validators share");
        assertEq(bDelta, (amount * 500)  / 10_000, "burn share");
        assertGe(cDelta, (amount * 500)  / 10_000, "community share min");

        // I1 — sum equals total input
        assertEq(tDelta + vDelta + bDelta + cDelta, amount, "sum = total");

        // I3 — cumulative counters
        assertEq(d.cumulativeToTreasury(),  tDelta);
        assertEq(d.cumulativeToValidators(), vDelta);
        assertEq(d.cumulativeToBurn(),       bDelta);
        assertEq(d.cumulativeToCommunity(),  cDelta);
    }
}
