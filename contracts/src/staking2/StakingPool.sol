// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  StakingPool
 * @author WINTG Team
 * @notice Pool de staking simple : stake un token, gagne des rewards
 *         dans un autre token.
 *
 *         Caractéristiques :
 *           - rewardRate ajustable par owner avec timelock 24h
 *           - lock period optionnel (early withdrawal penalty configurable)
 *           - 1 % platform fee sur les rewards distribués (au treasury)
 *           - pause d'urgence
 *
 *         Une `StakingFactory` peut déployer plusieurs pools indépendants.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract StakingPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint96 public constant PLATFORM_FEE_BPS = 100;     // 1 %
    uint64 public constant RATE_TIMELOCK    = 24 hours;
    uint96 public constant MAX_PENALTY_BPS  = 5000;    // 50 % max early withdrawal penalty

    IERC20  public immutable stakingToken;
    IERC20  public immutable rewardToken;
    address public treasury;

    uint256 public rewardRate;          // rewards per second (in rewardToken units)
    uint256 public pendingRewardRate;
    uint64  public pendingRateAvailableAt;

    uint64  public lockSeconds;         // 0 = no lock
    uint96  public earlyWithdrawalPenaltyBps;

    // Standard "synthetix-style" accounting.
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public totalStaked;
    mapping(address => uint256) public balances;
    mapping(address => uint64)  public stakedAt;

    bool public paused;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 penalty);
    event RewardClaimed(address indexed user, uint256 amount, uint256 platformFee);
    event RewardRateProposed(uint256 newRate, uint64 availableAt);
    event RewardRateApplied(uint256 newRate);
    event LockChanged(uint64 lockSeconds, uint96 penaltyBps);
    event Paused();
    event Unpaused();
    event TreasuryChanged(address indexed previous, address indexed current);

    error PoolPaused();
    error LockNotElapsed(uint64 unlockAt);
    error InvalidPenalty();
    error TimelockActive(uint64 readyAt);
    error InvalidParams();

    constructor(
        address initialOwner,
        address initialTreasury,
        IERC20  stakingToken_,
        IERC20  rewardToken_,
        uint64  lockSeconds_,
        uint96  earlyPenaltyBps_,
        uint256 initialRewardRate
    ) Ownable(initialOwner) {
        if (address(stakingToken_) == address(0) || address(rewardToken_) == address(0)) revert InvalidParams();
        if (earlyPenaltyBps_ > MAX_PENALTY_BPS) revert InvalidPenalty();
        treasury = initialTreasury;
        stakingToken = stakingToken_;
        rewardToken = rewardToken_;
        lockSeconds = lockSeconds_;
        earlyWithdrawalPenaltyBps = earlyPenaltyBps_;
        rewardRate = initialRewardRate;
        lastUpdateTime = block.timestamp;
    }

    // -------------------------------------------------------------------------
    // Accounting (synthetix-like)
    // -------------------------------------------------------------------------

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + ((block.timestamp - lastUpdateTime) * rewardRate * 1e18) / totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return ((balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18) + rewards[account];
    }

    // -------------------------------------------------------------------------
    // User actions
    // -------------------------------------------------------------------------

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (paused) revert PoolPaused();
        if (amount == 0) revert InvalidParams();
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        totalStaked += amount;
        balances[msg.sender] += amount;
        if (stakedAt[msg.sender] == 0) stakedAt[msg.sender] = uint64(block.timestamp);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0 || amount > balances[msg.sender]) revert InvalidParams();
        uint256 penalty = 0;
        if (lockSeconds > 0 && block.timestamp < uint256(stakedAt[msg.sender]) + uint256(lockSeconds)) {
            // Early withdrawal: penalty
            penalty = (amount * earlyWithdrawalPenaltyBps) / 10_000;
        }
        balances[msg.sender] -= amount;
        totalStaked -= amount;
        uint256 toUser = amount - penalty;
        stakingToken.safeTransfer(msg.sender, toUser);
        if (penalty > 0) stakingToken.safeTransfer(treasury, penalty);
        emit Withdrawn(msg.sender, toUser, penalty);
    }

    function claim() external nonReentrant updateReward(msg.sender) {
        uint256 r = rewards[msg.sender];
        if (r == 0) return;
        rewards[msg.sender] = 0;
        uint256 fee = (r * PLATFORM_FEE_BPS) / 10_000;
        uint256 toUser = r - fee;
        rewardToken.safeTransfer(msg.sender, toUser);
        if (fee > 0) rewardToken.safeTransfer(treasury, fee);
        emit RewardClaimed(msg.sender, toUser, fee);
    }

    // -------------------------------------------------------------------------
    // Owner — pool config (24h timelock for rewardRate changes)
    // -------------------------------------------------------------------------

    function proposeRewardRate(uint256 newRate) external onlyOwner {
        pendingRewardRate = newRate;
        pendingRateAvailableAt = uint64(block.timestamp + RATE_TIMELOCK);
        emit RewardRateProposed(newRate, pendingRateAvailableAt);
    }

    function applyRewardRate() external onlyOwner updateReward(address(0)) {
        if (block.timestamp < pendingRateAvailableAt) revert TimelockActive(pendingRateAvailableAt);
        rewardRate = pendingRewardRate;
        pendingRewardRate = 0;
        pendingRateAvailableAt = 0;
        emit RewardRateApplied(rewardRate);
    }

    function setLock(uint64 lockSeconds_, uint96 penaltyBps_) external onlyOwner {
        if (penaltyBps_ > MAX_PENALTY_BPS) revert InvalidPenalty();
        lockSeconds = lockSeconds_;
        earlyWithdrawalPenaltyBps = penaltyBps_;
        emit LockChanged(lockSeconds_, penaltyBps_);
    }

    function pause() external onlyOwner { paused = true;  emit Paused();   }
    function unpause() external onlyOwner { paused = false; emit Unpaused(); }

    function setTreasury(address newTreasury) external onlyOwner {
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    /**
     * @notice Le owner topup la réserve de rewards. À faire avant que les
     *         users claim, sinon transferFrom dans claim() reverte.
     */
    function topupRewards(uint256 amount) external {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }
}
