// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {WintgMultiSender} from "../../src/utils/WintgMultiSender.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract WintgMultiSenderTest is Test {
    WintgMultiSender internal sender;
    MockERC20 internal token;

    address internal alice = address(0x100);
    address internal bob   = address(0x200);
    address internal carol = address(0x300);
    address internal payer;

    function setUp() public {
        sender = new WintgMultiSender();
        token  = new MockERC20();
        payer  = address(this);
        token.transfer(payer, 0); // payer == this
        vm.deal(payer, 1_000 ether);
    }

    /* --------------------------- Native ----------------------------- */

    function test_multisendNative_succeeds() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;

        (uint256 totalSent, uint256 failedCount) = sender.multisendNative{value: 6 ether}(recipients, amounts);

        assertEq(totalSent, 6 ether);
        assertEq(failedCount, 0);
        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance,   2 ether);
        assertEq(carol.balance, 3 ether);
    }

    function test_multisendNativeEqual() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        (uint256 totalSent, ) = sender.multisendNativeEqual{value: 4 ether}(recipients, 2 ether);
        assertEq(totalSent, 4 ether);
        assertEq(alice.balance, 2 ether);
        assertEq(bob.balance,   2 ether);
    }

    function test_multisendNative_excessRefunded() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        uint256 before = payer.balance;
        sender.multisendNative{value: 5 ether}(recipients, amounts);
        // 4 ether refunded
        assertEq(payer.balance, before - 1 ether);
    }

    function test_multisendNative_insufficientValue_reverts() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;
        vm.expectRevert(abi.encodeWithSelector(WintgMultiSender.InsufficientNative.selector, 5 ether, 1 ether));
        sender.multisendNative{value: 1 ether}(recipients, amounts);
    }

    /* --------------------------- ERC-20 ------------------------------ */

    function test_multisendERC20_succeeds() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;

        token.approve(address(sender), 1000 ether);
        uint256 total = sender.multisendERC20(token, recipients, amounts);
        assertEq(total, 300 ether);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(bob),   200 ether);
    }

    function test_multisendERC20Equal() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;
        token.approve(address(sender), 1000 ether);
        uint256 total = sender.multisendERC20Equal(token, recipients, 50 ether);
        assertEq(total, 150 ether);
        assertEq(token.balanceOf(alice), 50 ether);
    }

    function test_multisendERC20_lengthMismatch_reverts() public {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        token.approve(address(sender), 1000 ether);
        vm.expectRevert(WintgMultiSender.LengthMismatch.selector);
        sender.multisendERC20(token, recipients, amounts);
    }

    /* --------------------------- Limits ------------------------------ */

    function test_multisendNative_tooManyRecipients_reverts() public {
        address[] memory recipients = new address[](501);
        uint256[] memory amounts = new uint256[](501);
        vm.expectRevert(abi.encodeWithSelector(WintgMultiSender.TooManyRecipients.selector, 501));
        sender.multisendNative{value: 0}(recipients, amounts);
    }

    function test_multisendNative_emptyRecipients_reverts() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        vm.expectRevert(abi.encodeWithSelector(WintgMultiSender.TooManyRecipients.selector, 0));
        sender.multisendNative{value: 0}(recipients, amounts);
    }

    receive() external payable {}
}
