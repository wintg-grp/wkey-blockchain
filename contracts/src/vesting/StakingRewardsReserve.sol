// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  StakingRewardsReserve
 * @author WINTG Team
 * @notice Coffre de 150 M WTG (15 % du supply) destiné aux récompenses de
 *         staking. Aucun unlock automatique : la distribution est gérée par
 *         le contrat de Staking de la phase 2, qui prendra l'ownership de ce
 *         contrat le moment venu (jusque-là : multisig DAO).
 *
 *         Pour limiter le risque opérationnel pendant la phase bootstrap, ce
 *         contrat applique un **rate limit** : `MAX_DAILY_OUTFLOW_BPS` du
 *         total alloué peut être retiré par 24 h glissantes. Cela évite
 *         qu'une compromission de l'owner draine instantanément 150 M WTG.
 *
 * @dev    Le rate limit est volontairement on-chain (pas seulement
 *         multisig) pour offrir une garantie indépendante du quorum.
 */
contract StakingRewardsReserve is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Plafond du retrait sur 24 h glissantes, en basis points
    /// (1 % = 100 bps). 100 bps = 1 % du total alloué par jour, soit 1.5 M WTG.
    uint16 public constant MAX_DAILY_OUTFLOW_BPS = 100;

    /// @notice Fenêtre du rate limit.
    uint64 public constant WINDOW_SIZE = 1 days;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Allocation totale gérée par ce coffre.
    uint256 public immutable totalAllocation;

    /// @notice Cumul total déjà retiré (pour stats).
    uint256 public totalWithdrawn;

    /// @notice Cumul des retraits effectués depuis `windowStart`.
    uint256 public windowOutflow;

    /// @notice Début de la fenêtre courante du rate limit.
    uint64 public windowStart;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Withdrawn(address indexed to, uint256 amount, uint256 totalWithdrawn);
    event FundsReceived(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAllocation();
    error ZeroAddress();
    error AmountIsZero();
    error InsufficientBalance(uint256 requested, uint256 available);
    error DailyLimitExceeded(uint256 requested, uint256 remainingToday);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner_   Multisig DAO ou (en phase 2) contrat Staking.
     * @param totalAllocation_ Allocation totale (= 150 M WTG attendu).
     */
    constructor(address initialOwner_, uint256 totalAllocation_) Ownable(initialOwner_) {
        if (totalAllocation_ == 0) revert ZeroAllocation();
        totalAllocation = totalAllocation_;
        windowStart = uint64(block.timestamp);
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Owner actions
    // -------------------------------------------------------------------------

    /**
     * @notice Retire `amount` de WTG vers `to`. Soumis au rate limit journalier.
     * @dev    Réservé à l'owner. En phase 2, l'owner sera le contrat Staking
     *         qui appellera cette fonction selon ses propres règles.
     */
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert AmountIsZero();

        uint256 balance = address(this).balance;
        if (amount > balance) revert InsufficientBalance(amount, balance);

        // Rate limit : reset si fenêtre expirée
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= windowStart + WINDOW_SIZE) {
            windowStart = nowTs;
            windowOutflow = 0;
        }

        uint256 limit = dailyLimit();
        uint256 remaining = limit > windowOutflow ? limit - windowOutflow : 0;
        if (amount > remaining) revert DailyLimitExceeded(amount, remaining);

        windowOutflow += amount;
        totalWithdrawn += amount;

        emit Withdrawn(to, amount, totalWithdrawn);
        payable(to).sendValue(amount);
    }

    /// @notice Met en pause les retraits (pause d'urgence).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Reprend les retraits après pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Plafond journalier en wei (constant : 1 % de totalAllocation).
    function dailyLimit() public view returns (uint256) {
        return (totalAllocation * MAX_DAILY_OUTFLOW_BPS) / 10_000;
    }

    /// @notice Quantité encore retirable sur la fenêtre 24 h en cours.
    function remainingToday() external view returns (uint256) {
        if (uint64(block.timestamp) >= windowStart + WINDOW_SIZE) {
            return dailyLimit();
        }
        uint256 limit = dailyLimit();
        return limit > windowOutflow ? limit - windowOutflow : 0;
    }
}
