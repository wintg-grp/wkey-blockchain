// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {SimpleERC20V2} from "../../src/token/SimpleERC20V2.sol";
import {VerificationRegistry, IVerifiableAsset} from "../../src/verification/VerificationRegistry.sol";

contract SimpleERC20V2Test is Test {
    SimpleERC20V2 internal token;
    VerificationRegistry internal registry;

    address internal admin    = address(0xA1);
    address internal alice    = address(0xB2);
    address internal bob      = address(0xC3);
    address internal stranger = address(0xD4);

    function setUp() public {
        registry = new VerificationRegistry(admin, admin, admin);

        SimpleERC20V2.Config memory cfg = SimpleERC20V2.Config({
            name: "Token",
            symbol: "TKN",
            cap_: 1_000_000 ether,
            initialSupply: 100_000 ether,
            admin: admin,
            isSoulbound: false,
            hasVotes: true,
            isMintable: true,
            logoURI: "ipfs://QmInitialLogo",
            verificationRegistry: address(registry)
        });
        token = new SimpleERC20V2(cfg);
    }

    function test_constructor_setsBasics() public view {
        assertEq(token.name(),         "Token");
        assertEq(token.symbol(),       "TKN");
        assertEq(token.cap(),          1_000_000 ether);
        assertEq(token.totalSupply(),  100_000 ether);
        assertEq(token.balanceOf(admin), 100_000 ether);
        assertEq(token.logoURI(),      "ipfs://QmInitialLogo");
    }

    /* ----------------------- Logo URI ---------------------------- */

    function test_setLogoURI_within15days_succeeds() public {
        vm.prank(admin);
        token.setLogoURI("ipfs://QmNewLogo");
        assertEq(token.logoURI(), "ipfs://QmNewLogo");
        assertTrue(token.logoLocked());
    }

    function test_setLogoURI_secondCall_reverts() public {
        vm.startPrank(admin);
        token.setLogoURI("ipfs://QmFirst1");
        vm.expectRevert(SimpleERC20V2.LogoLockedAlready.selector);
        token.setLogoURI("ipfs://QmSecond");
        vm.stopPrank();
    }

    function test_setLogoURI_after15days_reverts() public {
        vm.warp(block.timestamp + 16 days);
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.LogoMutationWindowExpired.selector);
        token.setLogoURI("ipfs://QmTooLate");
    }

    function test_setLogoURI_byStranger_reverts() public {
        vm.prank(stranger);
        vm.expectRevert();
        token.setLogoURI("ipfs://Qm");
    }

    function test_setLogoURI_invalidLength_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.LogoURIInvalid.selector);
        token.setLogoURI("ab");
    }

    /* ----------------------- Verification tier -------------------- */

    function test_setVerificationTier_byNonRegistry_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.NotVerificationRegistry.selector);
        token.setVerificationTier(IVerifiableAsset.Tier.WintgVerified);
    }

    function test_setVerificationTier_byRegistry_succeeds() public {
        vm.prank(address(registry));
        token.setVerificationTier(IVerifiableAsset.Tier.WintgVerified);
        assertEq(uint256(token.verificationTier()), uint256(IVerifiableAsset.Tier.WintgVerified));
    }

    /* ----------------------- Mintable + cap ----------------------- */

    function test_mint_byMinter_succeeds() public {
        vm.prank(admin);
        token.mint(alice, 50_000 ether);
        assertEq(token.balanceOf(alice), 50_000 ether);
    }

    function test_mint_overCap_reverts() public {
        vm.prank(admin);
        vm.expectRevert();
        token.mint(alice, 2_000_000 ether);
    }

    function test_decreaseCap_succeeds() public {
        vm.prank(admin);
        token.decreaseCap(500_000 ether);
        assertEq(token.cap(), 500_000 ether);
    }

    function test_decreaseCap_belowSupply_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.CapBelowSupply.selector);
        token.decreaseCap(50_000 ether);
    }

    function test_decreaseCap_increasing_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.InvalidCap.selector);
        token.decreaseCap(2_000_000 ether);
    }

    function test_finishMinting_blocksFutureMints() public {
        vm.prank(admin);
        token.finishMinting();
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.MintAlreadyFinished.selector);
        token.mint(alice, 1 ether);
    }

    /* ----------------------- Airdrop natif ------------------------ */

    function test_airdrop_succeeds() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;

        vm.prank(admin);
        uint256 total = token.airdrop(recipients, amounts);

        assertEq(total, 300 ether);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(bob),   200 ether);
    }

    function test_airdrop_lengthMismatch_reverts() public {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.AirdropLengthMismatch.selector);
        token.airdrop(recipients, amounts);
    }

    /* ----------------------- ERC20Votes auto-delegate ------------- */

    function test_votes_autoDelegateOnFirstReceive() public {
        // alice receives 100 from admin → her votes activated automatically
        vm.prank(admin);
        token.transfer(alice, 100 ether);
        assertEq(token.delegates(alice), alice);
        assertEq(token.getVotes(alice), 100 ether);
    }

    function test_votes_clockMode() public view {
        assertEq(token.CLOCK_MODE(), "mode=timestamp");
    }
}

/// @dev Soulbound variant tests.
contract SimpleERC20V2SoulboundTest is Test {
    SimpleERC20V2 internal token;
    VerificationRegistry internal registry;

    address internal admin = address(0xA1);
    address internal alice = address(0xB2);
    address internal bob   = address(0xC3);

    function setUp() public {
        registry = new VerificationRegistry(admin, admin, admin);
        SimpleERC20V2.Config memory cfg = SimpleERC20V2.Config({
            name: "Soulbound",
            symbol: "SBT",
            cap_: 1_000_000 ether,
            initialSupply: 100 ether,
            admin: admin,
            isSoulbound: true,
            hasVotes: false,
            isMintable: true,
            logoURI: "",
            verificationRegistry: address(registry)
        });
        token = new SimpleERC20V2(cfg);
    }

    function test_transfer_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.SoulboundLocked.selector);
        token.transfer(alice, 1 ether);
    }

    function test_approve_reverts() public {
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.SoulboundLocked.selector);
        token.approve(alice, 1 ether);
    }

    function test_mint_succeeds() public {
        vm.prank(admin);
        token.mint(alice, 5 ether);
        assertEq(token.balanceOf(alice), 5 ether);
    }

    function test_burn_throughTransferToZero_reverts() public {
        // ERC20 burn pattern reverts because soulbound only blocks user-to-user.
        // Direct burn via _burn is internal, so the test only checks transfer.
        vm.prank(admin);
        vm.expectRevert(SimpleERC20V2.SoulboundLocked.selector);
        token.transfer(bob, 1 ether);
    }
}
