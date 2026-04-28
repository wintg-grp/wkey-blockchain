// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StakingPool} from "./StakingPool.sol";

/**
 * @title  StakingFactory
 * @author WINTG Team
 * @notice Factory publique pour créer des pools de staking. 100 WTG fee
 *         (gratuit team WINTG). Distribution 70/20/10 (Treasury / Admin / Burn).
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step.
 */
contract StakingFactory is Ownable2Step, ReentrancyGuard {
    uint256 public constant TREASURY_BPS = 7000;
    uint256 public constant ADMIN_BPS    = 2000;
    uint256 public constant BURN_BPS     = 1000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public creationFee = 100 ether;
    address public treasury;
    address public verificationAdmin;

    mapping(address => bool) public isTeamMember;

    address[] public pools;
    mapping(address => address[]) public poolsOfCreator;

    event PoolCreated(address indexed pool, address indexed creator, address stakingToken, address rewardToken);
    event TeamMemberAdded(address indexed member);
    event TeamMemberRemoved(address indexed member);
    event CreationFeeChanged(uint256 newFee);
    event TreasuryChanged(address indexed previous, address indexed current);
    event VerificationAdminChanged(address indexed previous, address indexed current);
    event FeeDistributed(uint256 toTreasury, uint256 toAdmin, uint256 toBurn);

    error InvalidAddress();
    error WrongFee(uint256 sent, uint256 expected);
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury, address initialAdmin) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
        verificationAdmin = initialAdmin;
        emit TreasuryChanged(address(0), initialTreasury);
        emit VerificationAdminChanged(address(0), initialAdmin);
    }

    /**
     * @notice Crée un pool de staking. Le creator devient owner du pool.
     *         100 WTG (gratuit team).
     */
    function createPool(
        IERC20 stakingToken,
        IERC20 rewardToken,
        uint64 lockSeconds,
        uint96 earlyPenaltyBps,
        uint256 initialRewardRate
    ) external payable nonReentrant returns (address pool) {
        bool free = isTeamMember[msg.sender];
        uint256 expectedFee = free ? 0 : creationFee;
        if (msg.value != expectedFee) revert WrongFee(msg.value, expectedFee);

        StakingPool sp = new StakingPool(
            msg.sender, treasury, stakingToken, rewardToken,
            lockSeconds, earlyPenaltyBps, initialRewardRate
        );
        pool = address(sp);

        pools.push(pool);
        poolsOfCreator[msg.sender].push(pool);

        if (msg.value > 0) _distributeFee(msg.value);

        emit PoolCreated(pool, msg.sender, address(stakingToken), address(rewardToken));
    }

    function addTeamMember(address m) external onlyOwner {
        if (m == address(0)) revert InvalidAddress();
        isTeamMember[m] = true;
        emit TeamMemberAdded(m);
    }
    function removeTeamMember(address m) external onlyOwner {
        isTeamMember[m] = false;
        emit TeamMemberRemoved(m);
    }
    function setCreationFee(uint256 newFee) external onlyOwner {
        creationFee = newFee;
        emit CreationFeeChanged(newFee);
    }
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

    function poolsCount() external view returns (uint256) { return pools.length; }
    function poolsOfCreatorCount(address c) external view returns (uint256) { return poolsOfCreator[c].length; }
    function poolsSlice(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = pools.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = pools[i];
    }

    function _distributeFee(uint256 amount) internal {
        uint256 toTreasury = (amount * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (amount * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = amount - toTreasury - toAdmin;
        _safeSend(payable(treasury),          toTreasury);
        _safeSend(payable(verificationAdmin), toAdmin);
        _safeSend(payable(BURN_ADDRESS),      toBurn);
        emit FeeDistributed(toTreasury, toAdmin, toBurn);
    }

    function _safeSend(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
