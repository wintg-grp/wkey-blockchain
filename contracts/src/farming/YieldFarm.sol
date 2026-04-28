// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  YieldFarm
 * @author WINTG Team
 * @notice Farming pool : stake un LP token, gagne des rewards en jusqu'à
 *         3 tokens différents simultanément. 1 % platform fee.
 *
 * @dev    Identique à `StakingPool` mais avec multi-rewards. Conforme WINTG.
 */
contract YieldFarm is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint96 public constant PLATFORM_FEE_BPS = 100;     // 1 %
    uint64 public constant RATE_TIMELOCK    = 24 hours;
    uint96 public constant MAX_PENALTY_BPS  = 5000;
    uint8  public constant MAX_REWARDS      = 3;

    IERC20  public immutable stakingToken;
    address public treasury;

    address[] public rewardTokens;

    struct RewardData {
        uint256 rate;                    // per second
        uint256 perTokenStored;
        uint256 lastUpdateTime;
        uint256 pendingRate;
        uint64  pendingAvailableAt;
    }
    mapping(uint256 => RewardData) public rewardData;
    mapping(address => mapping(uint256 => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(uint256 => uint256)) public earnedRewards;

    uint256 public totalStaked;
    mapping(address => uint256) public balances;
    mapping(address => uint64)  public stakedAt;

    uint64  public lockSeconds;
    uint96  public earlyPenaltyBps;
    bool    public paused;

    event RewardTokenAdded(uint256 indexed idx, address indexed token, uint256 rate);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 penalty);
    event RewardClaimed(address indexed user, uint256 indexed idx, uint256 amount, uint256 fee);
    event RewardRateProposed(uint256 indexed idx, uint256 newRate, uint64 availableAt);
    event RewardRateApplied(uint256 indexed idx, uint256 newRate);
    event Paused(); event Unpaused();
    event TreasuryChanged(address indexed previous, address indexed current);

    error PoolPaused();
    error TooManyRewards();
    error InvalidParams();
    error TimelockActive(uint64 readyAt);
    error InvalidPenalty();

    constructor(
        address initialOwner, address initialTreasury,
        IERC20 stakingToken_,
        address[] memory rewardTokens_, uint256[] memory initialRates,
        uint64 lockSeconds_, uint96 earlyPenaltyBps_
    ) Ownable(initialOwner) {
        if (rewardTokens_.length == 0 || rewardTokens_.length > MAX_REWARDS) revert TooManyRewards();
        if (rewardTokens_.length != initialRates.length) revert InvalidParams();
        if (earlyPenaltyBps_ > MAX_PENALTY_BPS) revert InvalidPenalty();
        treasury = initialTreasury;
        stakingToken = stakingToken_;
        lockSeconds = lockSeconds_;
        earlyPenaltyBps = earlyPenaltyBps_;
        for (uint256 i; i < rewardTokens_.length; ++i) {
            rewardTokens.push(rewardTokens_[i]);
            rewardData[i] = RewardData({
                rate: initialRates[i],
                perTokenStored: 0,
                lastUpdateTime: block.timestamp,
                pendingRate: 0,
                pendingAvailableAt: 0
            });
            emit RewardTokenAdded(i, rewardTokens_[i], initialRates[i]);
        }
    }

    function rewardTokensLength() external view returns (uint256) { return rewardTokens.length; }

    modifier updateAll(address account) {
        for (uint256 i; i < rewardTokens.length; ++i) {
            _updateOne(account, i);
        }
        _;
    }

    function _updateOne(address account, uint256 idx) internal {
        RewardData storage rd = rewardData[idx];
        uint256 stored = _rewardPerToken(idx);
        rd.perTokenStored = stored;
        rd.lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            earnedRewards[account][idx] = _earned(account, idx, stored);
            userRewardPerTokenPaid[account][idx] = stored;
        }
    }

    function _rewardPerToken(uint256 idx) internal view returns (uint256) {
        RewardData storage rd = rewardData[idx];
        if (totalStaked == 0) return rd.perTokenStored;
        return rd.perTokenStored + ((block.timestamp - rd.lastUpdateTime) * rd.rate * 1e18) / totalStaked;
    }

    function _earned(address account, uint256 idx, uint256 stored) internal view returns (uint256) {
        return ((balances[account] * (stored - userRewardPerTokenPaid[account][idx])) / 1e18) + earnedRewards[account][idx];
    }

    function earned(address account, uint256 idx) external view returns (uint256) {
        return _earned(account, idx, _rewardPerToken(idx));
    }

    // -------------------------------------------------------------------------
    // User actions
    // -------------------------------------------------------------------------

    function stake(uint256 amount) external nonReentrant updateAll(msg.sender) {
        if (paused) revert PoolPaused();
        if (amount == 0) revert InvalidParams();
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        totalStaked += amount;
        balances[msg.sender] += amount;
        if (stakedAt[msg.sender] == 0) stakedAt[msg.sender] = uint64(block.timestamp);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant updateAll(msg.sender) {
        if (amount == 0 || amount > balances[msg.sender]) revert InvalidParams();
        uint256 penalty = 0;
        if (lockSeconds > 0 && block.timestamp < uint256(stakedAt[msg.sender]) + uint256(lockSeconds)) {
            penalty = (amount * earlyPenaltyBps) / 10_000;
        }
        balances[msg.sender] -= amount;
        totalStaked -= amount;
        uint256 toUser = amount - penalty;
        stakingToken.safeTransfer(msg.sender, toUser);
        if (penalty > 0) stakingToken.safeTransfer(treasury, penalty);
        emit Withdrawn(msg.sender, toUser, penalty);
    }

    function claim(uint256 idx) external nonReentrant {
        _updateOne(msg.sender, idx);
        uint256 r = earnedRewards[msg.sender][idx];
        if (r == 0) return;
        earnedRewards[msg.sender][idx] = 0;
        uint256 fee = (r * PLATFORM_FEE_BPS) / 10_000;
        IERC20 tk = IERC20(rewardTokens[idx]);
        tk.safeTransfer(msg.sender, r - fee);
        if (fee > 0) tk.safeTransfer(treasury, fee);
        emit RewardClaimed(msg.sender, idx, r - fee, fee);
    }

    function claimAll() external nonReentrant {
        for (uint256 i; i < rewardTokens.length; ++i) {
            _updateOne(msg.sender, i);
            uint256 r = earnedRewards[msg.sender][i];
            if (r == 0) continue;
            earnedRewards[msg.sender][i] = 0;
            uint256 fee = (r * PLATFORM_FEE_BPS) / 10_000;
            IERC20 tk = IERC20(rewardTokens[i]);
            tk.safeTransfer(msg.sender, r - fee);
            if (fee > 0) tk.safeTransfer(treasury, fee);
            emit RewardClaimed(msg.sender, i, r - fee, fee);
        }
    }

    function topupReward(uint256 idx, uint256 amount) external {
        IERC20(rewardTokens[idx]).safeTransferFrom(msg.sender, address(this), amount);
    }

    // -------------------------------------------------------------------------
    // Owner config
    // -------------------------------------------------------------------------

    function proposeRewardRate(uint256 idx, uint256 newRate) external onlyOwner {
        rewardData[idx].pendingRate = newRate;
        rewardData[idx].pendingAvailableAt = uint64(block.timestamp + RATE_TIMELOCK);
        emit RewardRateProposed(idx, newRate, rewardData[idx].pendingAvailableAt);
    }

    function applyRewardRate(uint256 idx) external onlyOwner {
        if (block.timestamp < rewardData[idx].pendingAvailableAt) revert TimelockActive(rewardData[idx].pendingAvailableAt);
        _updateOne(address(0), idx);
        rewardData[idx].rate = rewardData[idx].pendingRate;
        rewardData[idx].pendingRate = 0;
        rewardData[idx].pendingAvailableAt = 0;
        emit RewardRateApplied(idx, rewardData[idx].rate);
    }

    function pause() external onlyOwner { paused = true; emit Paused(); }
    function unpause() external onlyOwner { paused = false; emit Unpaused(); }
    function setTreasury(address newTreasury) external onlyOwner {
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }
}
