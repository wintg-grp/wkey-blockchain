// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @notice Interface du `StakingRewardsReserve` pour appels externes.
 */
interface IStakingRewardsReserve {
    function withdraw(address to, uint256 amount) external;
    function dailyLimit() external view returns (uint256);
    function remainingToday() external view returns (uint256);
}

/**
 * @title  WINTGStaking
 * @author WINTG Team
 * @notice Staking du WTG natif. Les utilisateurs verrouillent leur WTG, gagnent
 *         des récompenses linéaires en WTG provenant de `StakingRewardsReserve`.
 *
 *         Modèle : récompense par seconde (`rewardRate`), distribuée pro-rata
 *         de la part stakée de chaque utilisateur (algo Synthetix-style avec
 *         `rewardPerToken`).
 *
 *         Sécurité :
 *           - Délai de unstake configurable (cooldown) pour éviter les
 *             attaques de flash-staking pendant les votes DAO.
 *           - Le `WINTGStaking` doit être l'owner du `StakingRewardsReserve`
 *             pour pouvoir tirer dessus.
 *           - Le `rewardRate` est modifiable uniquement par l'owner du
 *             staking (= `WINTGTimelock` après transfer d'ownership), avec
 *             un plafond `MAX_REWARD_RATE` immuable pour cap l'inflation.
 *
 * @dev    Le contrat conserve les WTG stakés (balance native). Les
 *         récompenses sont tirées du `StakingRewardsReserve` lors de chaque
 *         `claim`/`unstake` (lazy distribution).
 */
contract WINTGStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Plafond du `rewardRate` en wei/seconde. Cap l'inflation à
    ///         ~4 %/an du supply (1B * 4 % / 31_536_000s ≈ 1.27 WTG/s).
    uint256 public constant MAX_REWARD_RATE = 1.5 ether;

    /// @notice Cooldown minimum à appliquer au unstake (anti-flash-vote).
    uint64 public constant MIN_COOLDOWN = 1 hours;

    /// @notice Cooldown maximum (cap pour éviter abus de l'owner).
    uint64 public constant MAX_COOLDOWN = 30 days;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    IStakingRewardsReserve public immutable rewardsReserve;

    /// @notice WTG distribués en récompense par seconde (à diviser par totalStaked).
    uint256 public rewardRate;

    /// @notice Délai obligatoire entre `requestUnstake` et `claimUnstaked`.
    uint64 public cooldownPeriod;

    /// @notice `rewardPerToken` accumulé jusqu'à `lastUpdate` (1e18 fixed-point).
    uint256 public rewardPerTokenStored;
    uint64 public lastUpdate;

    /// @notice Total des WTG stakés.
    uint256 public totalStaked;

    struct UserInfo {
        uint128 staked;            // WTG actifs
        uint128 pendingUnstake;    // WTG en attente de cooldown
        uint64  unstakeReadyAt;    // timestamp à partir duquel claimUnstaked OK
        uint256 rewardPerTokenPaid;
        uint256 rewards;
    }
    mapping(address => UserInfo) public users;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Staked(address indexed user, uint256 amount, uint256 totalStaked);
    event UnstakeRequested(address indexed user, uint256 amount, uint64 readyAt);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event CooldownUpdated(uint64 oldCooldown, uint64 newCooldown);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error InsufficientStake(uint256 requested, uint256 staked);
    error CooldownActive(uint64 readyAt);
    error NoPendingUnstake();
    error RewardRateTooHigh(uint256 requested, uint256 max);
    error CooldownOutOfRange(uint64 requested, uint64 min, uint64 max);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address initialOwner_,
        address rewardsReserve_,
        uint256 initialRewardRate_,
        uint64  cooldownPeriod_
    ) Ownable(initialOwner_) {
        if (rewardsReserve_ == address(0)) revert ZeroAmount();
        if (initialRewardRate_ > MAX_REWARD_RATE) {
            revert RewardRateTooHigh(initialRewardRate_, MAX_REWARD_RATE);
        }
        if (cooldownPeriod_ < MIN_COOLDOWN || cooldownPeriod_ > MAX_COOLDOWN) {
            revert CooldownOutOfRange(cooldownPeriod_, MIN_COOLDOWN, MAX_COOLDOWN);
        }

        rewardsReserve = IStakingRewardsReserve(rewardsReserve_);
        rewardRate = initialRewardRate_;
        cooldownPeriod = cooldownPeriod_;
        lastUpdate = uint64(block.timestamp);
    }

    receive() external payable {
        // Les dépôts directs (hors stake()) servent à pré-financer
        // le pool de récompenses si besoin (ex: keeper).
    }

    // -------------------------------------------------------------------------
    // User actions — stake / unstake / claim
    // -------------------------------------------------------------------------

    /// @notice Stake `msg.value` WTG natifs.
    function stake() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        _updateReward(msg.sender);

        UserInfo storage u = users[msg.sender];
        u.staked += uint128(msg.value);
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value, totalStaked);
    }

    /**
     * @notice Demande à unstake `amount` WTG. Les fonds sont mis en `pendingUnstake`
     *         et débloquables après `cooldownPeriod`.
     */
    function requestUnstake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        UserInfo storage u = users[msg.sender];
        if (amount > u.staked) revert InsufficientStake(amount, u.staked);

        _updateReward(msg.sender);

        u.staked -= uint128(amount);
        u.pendingUnstake += uint128(amount);
        u.unstakeReadyAt = uint64(block.timestamp) + cooldownPeriod;
        totalStaked -= amount;

        emit UnstakeRequested(msg.sender, amount, u.unstakeReadyAt);
    }

    /// @notice Récupère les WTG mis en attente après le cooldown.
    function claimUnstaked() external nonReentrant {
        UserInfo storage u = users[msg.sender];
        uint256 amount = u.pendingUnstake;
        if (amount == 0) revert NoPendingUnstake();
        if (uint64(block.timestamp) < u.unstakeReadyAt) {
            revert CooldownActive(u.unstakeReadyAt);
        }

        u.pendingUnstake = 0;
        emit Unstaked(msg.sender, amount);

        payable(msg.sender).sendValue(amount);
    }

    /// @notice Réclame les récompenses accumulées (sans toucher au stake).
    function claimRewards() external nonReentrant whenNotPaused {
        _updateReward(msg.sender);
        UserInfo storage u = users[msg.sender];
        uint256 reward = u.rewards;
        if (reward == 0) revert ZeroAmount();
        u.rewards = 0;

        // Tirer depuis StakingRewardsReserve (rate-limited)
        rewardsReserve.withdraw(msg.sender, reward);
        emit RewardClaimed(msg.sender, reward);
    }

    // -------------------------------------------------------------------------
    // Owner controls (DAO Timelock)
    // -------------------------------------------------------------------------

    function setRewardRate(uint256 newRate) external onlyOwner {
        if (newRate > MAX_REWARD_RATE) revert RewardRateTooHigh(newRate, MAX_REWARD_RATE);
        _updateRewardGlobal();
        emit RewardRateUpdated(rewardRate, newRate);
        rewardRate = newRate;
    }

    function setCooldownPeriod(uint64 newCooldown) external onlyOwner {
        if (newCooldown < MIN_COOLDOWN || newCooldown > MAX_COOLDOWN) {
            revert CooldownOutOfRange(newCooldown, MIN_COOLDOWN, MAX_COOLDOWN);
        }
        emit CooldownUpdated(cooldownPeriod, newCooldown);
        cooldownPeriod = newCooldown;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 elapsed = uint256(block.timestamp) - uint256(lastUpdate);
        return rewardPerTokenStored + (elapsed * rewardRate * 1e18) / totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        UserInfo storage u = users[account];
        return uint256(u.staked) * (rewardPerToken() - u.rewardPerTokenPaid) / 1e18 + u.rewards;
    }

    function pendingUnstakeOf(address account) external view returns (uint256 amount, uint64 readyAt) {
        UserInfo storage u = users[account];
        return (u.pendingUnstake, u.unstakeReadyAt);
    }

    /// @notice APR estimé pour un stake `amount` au rewardRate courant.
    function estimatedAprBps(uint256 amount) external view returns (uint256) {
        if (totalStaked + amount == 0) return 0;
        // (rewardRate * 365 days) / (totalStaked + amount) en bps
        uint256 yearly = rewardRate * 365 days;
        return (yearly * 10_000) / (totalStaked + amount);
    }

    // -------------------------------------------------------------------------
    // Internal — accumulator update
    // -------------------------------------------------------------------------

    function _updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdate = uint64(block.timestamp);
        UserInfo storage u = users[account];
        u.rewards = earned(account);
        u.rewardPerTokenPaid = rewardPerTokenStored;
    }

    function _updateRewardGlobal() internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdate = uint64(block.timestamp);
    }
}
