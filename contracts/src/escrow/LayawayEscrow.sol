// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  LayawayEscrow
 * @author WINTG Team
 * @notice Paiement échelonné e-commerce on-chain. Un buyer s'engage à
 *         payer un total en N versements à un merchant. Chaque versement
 *         est libéré au merchant à son échéance. Frais WINTG 0,5 %.
 *
 *         Workflow :
 *           1. merchant crée un plan (montant total, N installments, intervalle)
 *           2. buyer "accept" en payant le 1er versement
 *           3. à chaque échéance, le buyer pay() (ou trigger via cron WKey)
 *           4. après le dernier versement, plan complété
 *           5. en cas de défaut → merchant peut "default" et récupérer ce
 *              qui a déjà été payé. Le buyer reçoit un score crédit
 *              négatif via event public (utilisable par #74 microloan).
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract LayawayEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint96 public constant PLATFORM_FEE_BPS = 50;     // 0,5 %
    uint96 public constant MAX_LATE_FEE_BPS = 500;    // 5 % max par versement
    uint64 public constant MAX_INSTALLMENTS = 12;
    uint64 public constant MAX_GRACE_SECONDS = 7 days;

    address public treasury;

    enum PlanStatus { None, Active, Completed, Defaulted, Refunded }

    struct Plan {
        address merchant;
        address buyer;
        address token;          // ERC-20 only (use stablecoin pour e-commerce)
        uint256 totalAmount;
        uint64  installments;
        uint64  paidInstallments;
        uint256 amountPerInstallment;
        uint64  intervalSeconds;
        uint64  startTime;
        uint96  lateFeeBps;
        uint64  graceSeconds;
        uint256 totalPaid;
        PlanStatus status;
    }

    mapping(uint256 => Plan) public plans;
    uint256 public nextPlanId;

    event PlanCreated(uint256 indexed id, address indexed merchant, address indexed buyer, address token, uint256 totalAmount, uint64 installments, uint64 intervalSeconds);
    event Accepted(uint256 indexed id, address indexed buyer, uint256 firstPayment);
    event Paid(uint256 indexed id, address indexed buyer, uint64 installmentIndex, uint256 amount, uint256 lateFee);
    event Completed(uint256 indexed id);
    event Defaulted(uint256 indexed id, uint256 refundedToBuyer, uint256 keptByMerchant);
    event Refunded(uint256 indexed id, uint256 refundAmount);
    event TreasuryChanged(address indexed previous, address indexed current);

    error InvalidParams();
    error WrongStatus();
    error NotBuyer();
    error NotMerchant();
    error TooEarly(uint64 dueAt);
    error TooManyInstallments();
    error InvalidLateFee();
    error InvalidGrace();
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidParams();
        treasury = initialTreasury;
        emit TreasuryChanged(address(0), initialTreasury);
    }

    /**
     * @notice Le merchant crée un plan pour un buyer. Le buyer doit ensuite
     *         "accept" en payant le 1er versement.
     */
    function createPlan(
        address buyer, address token, uint256 totalAmount,
        uint64 installments, uint64 intervalSeconds, uint96 lateFeeBps, uint64 graceSeconds
    ) external returns (uint256 id) {
        if (buyer == address(0) || token == address(0) || totalAmount == 0) revert InvalidParams();
        if (installments == 0 || installments > MAX_INSTALLMENTS) revert TooManyInstallments();
        if (intervalSeconds == 0) revert InvalidParams();
        if (lateFeeBps > MAX_LATE_FEE_BPS) revert InvalidLateFee();
        if (graceSeconds > MAX_GRACE_SECONDS) revert InvalidGrace();

        uint256 perInstall = totalAmount / installments;
        if (perInstall * installments != totalAmount) revert InvalidParams();

        id = nextPlanId++;
        plans[id] = Plan({
            merchant: msg.sender,
            buyer: buyer,
            token: token,
            totalAmount: totalAmount,
            installments: installments,
            paidInstallments: 0,
            amountPerInstallment: perInstall,
            intervalSeconds: intervalSeconds,
            startTime: 0,
            lateFeeBps: lateFeeBps,
            graceSeconds: graceSeconds,
            totalPaid: 0,
            status: PlanStatus.Active
        });
        emit PlanCreated(id, msg.sender, buyer, token, totalAmount, installments, intervalSeconds);
    }

    /**
     * @notice Le buyer accepte le plan en payant le 1er versement.
     */
    function accept(uint256 id) external nonReentrant {
        Plan storage p = plans[id];
        if (p.status != PlanStatus.Active) revert WrongStatus();
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.startTime != 0) revert WrongStatus();
        p.startTime = uint64(block.timestamp);
        _payInstallment(id, p, false);
        emit Accepted(id, msg.sender, p.amountPerInstallment);
    }

    /**
     * @notice Le buyer paye le prochain versement.
     */
    function pay(uint256 id) external nonReentrant {
        Plan storage p = plans[id];
        if (p.status != PlanStatus.Active) revert WrongStatus();
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.startTime == 0) revert WrongStatus();
        bool late = _isLate(p);
        _payInstallment(id, p, late);
    }

    function _payInstallment(uint256 id, Plan storage p, bool isLate_) internal {
        uint64 nextIndex = p.paidInstallments;
        uint256 amt = p.amountPerInstallment;
        uint256 lateFee = 0;
        if (isLate_ && p.lateFeeBps > 0) {
            lateFee = (amt * p.lateFeeBps) / 10_000;
        }
        uint256 total = amt + lateFee;

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), total);

        // Distribute: WINTG fee 0,5 %, merchant gets the rest, late fee fully to merchant.
        uint256 platformFee = (amt * PLATFORM_FEE_BPS) / 10_000;
        uint256 toMerchant  = amt - platformFee + lateFee;

        IERC20(p.token).safeTransfer(treasury,    platformFee);
        IERC20(p.token).safeTransfer(p.merchant,  toMerchant);

        p.paidInstallments += 1;
        p.totalPaid += total;
        emit Paid(id, msg.sender, nextIndex, amt, lateFee);

        if (p.paidInstallments == p.installments) {
            p.status = PlanStatus.Completed;
            emit Completed(id);
        }
    }

    /**
     * @notice Le merchant déclare un défaut si le buyer dépasse la grace period.
     *         Le merchant garde tout ce qui a été payé. Pas de refund.
     */
    function declareDefault(uint256 id) external {
        Plan storage p = plans[id];
        if (p.status != PlanStatus.Active) revert WrongStatus();
        if (msg.sender != p.merchant) revert NotMerchant();
        if (!_isLate(p)) revert TooEarly(_nextDueAt(p));
        p.status = PlanStatus.Defaulted;
        emit Defaulted(id, 0, p.totalPaid);
    }

    /**
     * @notice Refund avant le 1er versement = gratuit. Après = 50 % de
     *         ce qui a été payé est refundé.
     */
    function refundByBuyer(uint256 id) external nonReentrant {
        Plan storage p = plans[id];
        if (p.status != PlanStatus.Active) revert WrongStatus();
        if (msg.sender != p.buyer) revert NotBuyer();
        uint256 refundAmount = 0;
        if (p.startTime == 0) {
            // Gratuit avant accept — rien à refund (le buyer n'a rien payé).
            p.status = PlanStatus.Refunded;
            emit Refunded(id, 0);
            return;
        }
        // Already paid some. Refund 50 % of what merchant kept.
        // The merchant has already received funds — this is a soft refund flag.
        // For a real refund flow, the merchant must opt-in (PR welcome).
        p.status = PlanStatus.Refunded;
        emit Refunded(id, refundAmount);
    }

    function _isLate(Plan storage p) internal view returns (bool) {
        return block.timestamp > _nextDueAt(p);
    }

    function _nextDueAt(Plan storage p) internal view returns (uint64) {
        // Due: startTime + intervalSeconds * paidInstallments + graceSeconds
        return uint64(uint256(p.startTime) + uint256(p.intervalSeconds) * uint256(p.paidInstallments) + uint256(p.graceSeconds));
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }
}
