// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {VerificationRegistry, IVerifiableAsset} from "../../src/verification/VerificationRegistry.sol";

/// @dev Mock asset that lets the registry write its tier.
contract MockAsset is IVerifiableAsset {
    Tier public tier;
    address public registry;

    constructor(address registry_) {
        registry = registry_;
    }

    function setVerificationTier(Tier newTier) external override {
        require(msg.sender == registry, "not registry");
        tier = newTier;
    }
}

contract VerificationRegistryTest is Test {
    VerificationRegistry internal reg;

    address internal owner    = address(0xA1);
    address internal admin    = address(0xB2);
    address internal treasury = address(0xC3);
    address internal creator  = address(0xD4);
    address internal stranger = address(0xE5);

    MockAsset internal asset;

    function setUp() public {
        reg = new VerificationRegistry(owner, admin, treasury);
        asset = new MockAsset(address(reg));
        vm.deal(creator, 10_000 ether);
    }

    /* --------------------------- Request flow ----------------------- */

    function test_requestVerification_succeeds() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));

        (address req, , VerificationRegistry.Status status, uint256 paid) = reg.requests(address(asset));
        assertEq(req, creator);
        assertEq(uint256(status), uint256(VerificationRegistry.Status.Pending));
        assertEq(paid, 500 ether);
    }

    function test_requestVerification_wrongFee_reverts() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(VerificationRegistry.WrongFee.selector, 100 ether, 500 ether));
        reg.requestVerification{value: 100 ether}(address(asset));
    }

    function test_requestVerification_alreadyPending_reverts() public {
        vm.startPrank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.expectRevert(VerificationRegistry.AlreadyPending.selector);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.stopPrank();
    }

    /* --------------------------- Approve ----------------------------- */

    function test_approveVerification_distributesFee() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));

        uint256 trBalBefore    = treasury.balance;
        uint256 adminBalBefore = admin.balance;
        uint256 burnBefore     = address(0xdEaD).balance;

        vm.prank(admin);
        reg.approveVerification(address(asset));

        // 70/20/10
        assertEq(treasury.balance       - trBalBefore,    350 ether);
        assertEq(admin.balance          - adminBalBefore, 100 ether);
        assertEq(address(0xdEaD).balance - burnBefore,     50 ether);

        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.WintgVerified));
    }

    function test_approveVerification_byStranger_reverts() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.prank(stranger);
        vm.expectRevert(VerificationRegistry.NotAdmin.selector);
        reg.approveVerification(address(asset));
    }

    /* --------------------------- Reject ------------------------------ */

    function test_rejectVerification_50pctRefund() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));

        uint256 creatorBefore  = creator.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(admin);
        reg.rejectVerification(address(asset), "Bad audit", "ipfs://Qm0123456789");

        assertEq(creator.balance  - creatorBefore,  250 ether);
        assertEq(treasury.balance - treasuryBefore, 250 ether);
    }

    function test_rejectVerification_invalidIPFSReport_reverts() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.prank(admin);
        vm.expectRevert(VerificationRegistry.InvalidIPFSReport.selector);
        reg.rejectVerification(address(asset), "Bad", "abc");
    }

    /* ----------------------- Stale refund ---------------------------- */

    function test_claimRefundIfStale_after14Days() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));

        vm.warp(block.timestamp + 14 days + 1);

        uint256 before = creator.balance;
        vm.prank(creator);
        reg.claimRefundIfStale(address(asset));
        assertEq(creator.balance - before, 500 ether);
    }

    function test_claimRefundIfStale_tooEarly_reverts() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.prank(creator);
        vm.expectRevert();
        reg.claimRefundIfStale(address(asset));
    }

    function test_claimRefundIfStale_notRequester_reverts() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.warp(block.timestamp + 14 days + 1);
        vm.prank(stranger);
        vm.expectRevert(VerificationRegistry.NotRequester.selector);
        reg.claimRefundIfStale(address(asset));
    }

    /* ----------------------- Revoke ---------------------------------- */

    function test_revokeVerification_setsTierToNone() public {
        vm.prank(creator);
        reg.requestVerification{value: 500 ether}(address(asset));
        vm.prank(admin);
        reg.approveVerification(address(asset));
        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.WintgVerified));

        vm.prank(admin);
        reg.revokeVerification(address(asset), "Found rugpull pattern", "ipfs://QmReportXYZ");
        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.None));
    }

    /* ----------------------- Factory tier 1 -------------------------- */

    function test_markFactoryCreated_byAuthorizedFactory() public {
        address factory = address(0xF00D);
        vm.prank(owner);
        reg.setFactoryAuthorized(factory, true);

        vm.prank(factory);
        reg.markFactoryCreated(address(asset));

        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.FactoryCreated));
    }

    function test_markFactoryCreated_unauthorized_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(VerificationRegistry.NotAuthorizedFactory.selector);
        reg.markFactoryCreated(address(asset));
    }

    /* ----------------------- Official tier --------------------------- */

    function test_setOfficial_byOwner() public {
        vm.prank(owner);
        reg.setOfficial(address(asset));
        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.WintgOfficial));
    }

    function test_setOfficialBatch_byOwner() public {
        MockAsset a2 = new MockAsset(address(reg));
        MockAsset a3 = new MockAsset(address(reg));
        address[] memory list = new address[](3);
        list[0] = address(asset);
        list[1] = address(a2);
        list[2] = address(a3);

        vm.prank(owner);
        reg.setOfficialBatch(list);

        assertEq(uint256(asset.tier()), uint256(IVerifiableAsset.Tier.WintgOfficial));
        assertEq(uint256(a2.tier()),    uint256(IVerifiableAsset.Tier.WintgOfficial));
        assertEq(uint256(a3.tier()),    uint256(IVerifiableAsset.Tier.WintgOfficial));
    }
}
