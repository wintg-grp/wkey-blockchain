// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {YieldFarm} from "./YieldFarm.sol";

/**
 * @title  YieldFarmFactory
 * @author WINTG Team
 * @notice Factory pour créer des yield farms multi-rewards. 100 WTG fee
 *         (gratuit team). Distribution 70/20/10.
 */
contract YieldFarmFactory is Ownable2Step, ReentrancyGuard {
    uint256 public constant TREASURY_BPS = 7000;
    uint256 public constant ADMIN_BPS    = 2000;
    uint256 public constant BURN_BPS     = 1000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public creationFee = 100 ether;
    address public treasury;
    address public verificationAdmin;

    mapping(address => bool) public isTeamMember;

    address[] public farms;
    mapping(address => address[]) public farmsOfCreator;

    event FarmCreated(address indexed farm, address indexed creator, address stakingToken);
    event TeamMemberAdded(address indexed member);
    event TeamMemberRemoved(address indexed member);
    event CreationFeeChanged(uint256 newFee);
    event TreasuryChanged(address indexed previous, address indexed current);
    event VerificationAdminChanged(address indexed previous, address indexed current);

    error InvalidAddress();
    error WrongFee(uint256 sent, uint256 expected);
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury, address initialAdmin) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
        verificationAdmin = initialAdmin;
    }

    function createFarm(
        IERC20 stakingToken,
        address[] calldata rewardTokens,
        uint256[] calldata initialRates,
        uint64 lockSeconds,
        uint96 earlyPenaltyBps
    ) external payable nonReentrant returns (address farm) {
        bool free = isTeamMember[msg.sender];
        uint256 expectedFee = free ? 0 : creationFee;
        if (msg.value != expectedFee) revert WrongFee(msg.value, expectedFee);

        YieldFarm yf = new YieldFarm(msg.sender, treasury, stakingToken, rewardTokens, initialRates, lockSeconds, earlyPenaltyBps);
        farm = address(yf);

        farms.push(farm);
        farmsOfCreator[msg.sender].push(farm);

        if (msg.value > 0) _distributeFee(msg.value);

        emit FarmCreated(farm, msg.sender, address(stakingToken));
    }

    function addTeamMember(address m) external onlyOwner { isTeamMember[m] = true; emit TeamMemberAdded(m); }
    function removeTeamMember(address m) external onlyOwner { isTeamMember[m] = false; emit TeamMemberRemoved(m); }
    function setCreationFee(uint256 newFee) external onlyOwner { creationFee = newFee; emit CreationFeeChanged(newFee); }
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }
    function setVerificationAdmin(address newAdmin) external onlyOwner {
        address previous = verificationAdmin;
        verificationAdmin = newAdmin;
        emit VerificationAdminChanged(previous, newAdmin);
    }

    function farmsCount() external view returns (uint256) { return farms.length; }
    function farmsOfCreatorCount(address c) external view returns (uint256) { return farmsOfCreator[c].length; }

    function _distributeFee(uint256 amount) internal {
        uint256 toTreasury = (amount * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (amount * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = amount - toTreasury - toAdmin;
        _safeSend(payable(treasury),          toTreasury);
        _safeSend(payable(verificationAdmin), toAdmin);
        _safeSend(payable(BURN_ADDRESS),      toBurn);
    }

    function _safeSend(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
