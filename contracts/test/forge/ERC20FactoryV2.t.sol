// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {ERC20FactoryV2} from "../../src/token/ERC20FactoryV2.sol";
import {SimpleERC20V2} from "../../src/token/SimpleERC20V2.sol";
import {VerificationRegistry, IVerifiableAsset} from "../../src/verification/VerificationRegistry.sol";

contract ERC20FactoryV2Test is Test {
    ERC20FactoryV2 internal factory;
    VerificationRegistry internal registry;

    address internal owner    = address(0xA1);
    address internal admin    = address(0xB2);
    address internal treasury = address(0xC3);
    address internal creator  = address(0xD4);
    address internal teamMember = address(0xD5);

    function setUp() public {
        registry = new VerificationRegistry(owner, admin, treasury);
        factory  = new ERC20FactoryV2(owner, treasury, address(registry));
        // Authorize the factory in the registry.
        vm.prank(owner);
        registry.setFactoryAuthorized(address(factory), true);

        // Add a team member.
        vm.prank(owner);
        factory.addTeamMember(teamMember);

        vm.deal(creator, 10_000 ether);
        vm.deal(teamMember, 10_000 ether);
    }

    function _params() internal pure returns (ERC20FactoryV2.CreateParams memory) {
        return ERC20FactoryV2.CreateParams({
            name: "MyToken",
            symbol: "MYT",
            cap: 1_000_000 ether,
            initialSupply: 100_000 ether,
            hasVotes: false,
            isMintable: false,
            isSoulbound: false,
            logoURI: ""
        });
    }

    /* --------------------------- Creation --------------------------- */

    function test_createToken_paid() public {
        vm.prank(creator);
        address tokenAddr = factory.createToken{value: 100 ether}(_params());
        SimpleERC20V2 token = SimpleERC20V2(tokenAddr);
        assertEq(token.name(),     "MyToken");
        assertEq(token.totalSupply(), 100_000 ether);
        assertEq(token.balanceOf(creator), 100_000 ether);
        assertEq(uint256(token.verificationTier()), uint256(IVerifiableAsset.Tier.FactoryCreated));
    }

    function test_createToken_freeForTeamMember() public {
        vm.prank(teamMember);
        address tokenAddr = factory.createToken{value: 0}(_params());
        SimpleERC20V2 token = SimpleERC20V2(tokenAddr);
        assertEq(token.balanceOf(teamMember), 100_000 ether);
    }

    function test_createToken_wrongFee_reverts() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(ERC20FactoryV2.WrongFee.selector, 50 ether, 100 ether));
        factory.createToken{value: 50 ether}(_params());
    }

    function test_createToken_teamWithExtraValue_reverts() public {
        vm.prank(teamMember);
        vm.expectRevert(abi.encodeWithSelector(ERC20FactoryV2.WrongFee.selector, 100 ether, 0));
        factory.createToken{value: 100 ether}(_params());
    }

    function test_createToken_distributesFee() public {
        uint256 trBefore    = treasury.balance;
        uint256 adminBefore = admin.balance;
        uint256 burnBefore  = address(0xdEaD).balance;

        vm.prank(creator);
        factory.createToken{value: 100 ether}(_params());

        assertEq(treasury.balance       - trBefore,    70 ether);
        assertEq(admin.balance          - adminBefore, 20 ether);
        assertEq(address(0xdEaD).balance - burnBefore, 10 ether);
    }

    function test_createToken_emptyName_reverts() public {
        ERC20FactoryV2.CreateParams memory p = _params();
        p.name = "";
        vm.prank(creator);
        vm.expectRevert(ERC20FactoryV2.InvalidParams.selector);
        factory.createToken{value: 100 ether}(p);
    }

    function test_createToken_tracksTokens() public {
        vm.prank(creator);
        address t1 = factory.createToken{value: 100 ether}(_params());
        vm.prank(teamMember);
        address t2 = factory.createToken{value: 0}(_params());

        assertEq(factory.tokensCount(), 2);
        assertEq(factory.tokens(0), t1);
        assertEq(factory.tokens(1), t2);
        assertEq(factory.tokensOfCreatorCount(creator), 1);
        assertEq(factory.tokensOfCreatorCount(teamMember), 1);
    }

    function test_tokensSlice_pagination() public {
        for (uint256 i; i < 5; ++i) {
            vm.prank(teamMember);
            factory.createToken{value: 0}(_params());
        }
        address[] memory page = factory.tokensSlice(1, 3);
        assertEq(page.length, 3);
    }

    /* --------------------------- Admin ------------------------------ */

    function test_addAndRemoveTeamMember() public {
        vm.prank(owner);
        factory.removeTeamMember(teamMember);
        assertFalse(factory.isTeamMember(teamMember));

        vm.prank(owner);
        factory.addTeamMember(creator);
        assertTrue(factory.isTeamMember(creator));
    }

    function test_setCreationFee_byOwner() public {
        vm.prank(owner);
        factory.setCreationFee(200 ether);
        assertEq(factory.creationFee(), 200 ether);
    }

    function test_setCreationFee_byStranger_reverts() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setCreationFee(0);
    }
}
