// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {VestingVault} from "../../src/vesting/VestingVault.sol";

/**
 * @title  VestingVaultFuzz
 * @notice Tests fuzz invariants critiques de VestingVault.
 *
 *   I1 — `released <= totalAllocation` à tout instant
 *   I2 — `vested(t) <= totalAllocation` pour tout `t`
 *   I3 — `vested(t)` est monotone non-décroissant en `t` (sans révoque)
 *   I4 — `tgeAmount` est libérable dès `start`
 */
contract VestingVaultFuzz is Test {
    VestingVault internal v;
    address internal owner = address(0xA);
    address internal beneficiary = address(0xB);

    uint64 internal startTs;
    uint256 internal constant TOTAL = 1000 ether;
    uint256 internal constant TGE = 100 ether;

    function setUp() public {
        startTs = uint64(block.timestamp + 100);
        v = new VestingVault(
            owner,
            beneficiary,
            startTs,
            30 days,    // cliff
            180 days,   // linear
            TGE,
            TOTAL,
            false
        );
        // Fund the vault as if Genesis pre-allocated
        vm.deal(address(v), TOTAL);
    }

    function testFuzz_VestedNeverExceedsTotal(uint64 timestamp) public view {
        uint256 vested = v.vestedAmount(timestamp);
        assertLe(vested, TOTAL, "I2: vested > total");
    }

    function testFuzz_VestedMonotone(uint64 t1, uint64 t2) public view {
        vm.assume(t1 <= t2);
        uint256 a = v.vestedAmount(t1);
        uint256 b = v.vestedAmount(t2);
        assertLe(a, b, "I3: vested non-monotone");
    }

    function testFuzz_TgeImmediatelyReleasable(uint64 delay) public {
        vm.assume(delay < 30 days); // before cliff
        vm.warp(startTs + delay);
        uint256 releasable = v.getReleasable();
        assertEq(releasable, TGE, "I4: tge not immediately released");
    }

    function testFuzz_ReleaseInvariant(uint64 delay) public {
        vm.assume(delay > 0 && delay < 365 days);
        vm.warp(startTs + delay);
        uint256 before = address(beneficiary).balance;
        if (v.getReleasable() > 0) {
            vm.prank(beneficiary);
            v.release();
            uint256 received = address(beneficiary).balance - before;
            assertEq(received, v.released(), "I1a: received != released delta");
        }
        assertLe(v.released(), TOTAL, "I1: released > total");
    }
}
