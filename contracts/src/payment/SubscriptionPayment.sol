// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WintgPriceAdmin}       from "./WintgPriceAdmin.sol";

/**
 * @title  SubscriptionPayment
 * @author WINTG Team
 * @notice Contrat générique d'abonnements payables en crypto (WTG, WKEY,
 *         USDW, WCFA, WWTG) avec **discount automatique** pour les
 *         paiements en token natif.
 *
 *         Modèle business :
 *           - Prix nominal : par exemple 10 000 CFA / mois
 *           - Discount crypto : 10 % par défaut (configurable par plan)
 *           - User paie 9 000 CFA équivalent en WTG (= 180 WTG à 50 CFA/WTG)
 *           - Tokens versés vers le LiquidityReserveVault
 *           - User reçoit son abonnement (event `SubscriptionGranted`)
 *
 *         Plusieurs plans en parallèle (basic / premium / pro / etc.) :
 *           - Prix configurable par plan
 *           - Durée configurable par plan
 *           - Discount configurable par plan
 *
 *         L'app off-chain consomme l'event ou interroge `subscriptionExpiresAt(user, planId)`
 *         pour vérifier si l'utilisateur est abonné.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract SubscriptionPayment is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Discount par défaut pour paiements crypto (10 % = 1000 bps).
    uint96 public constant DEFAULT_DISCOUNT_BPS = 1000;
    uint96 public constant MAX_DISCOUNT_BPS     = 5000; // max 50 %

    struct Plan {
        string  name;
        uint256 priceCfa;          // prix nominal en CFA (sans décimales)
        uint64  durationSeconds;   // durée d'un abonnement (ex: 30 days)
        uint96  cryptoDiscountBps; // discount appliqué au paiement crypto
        bool    active;
        bool    exists;
    }

    /// @notice Liste des tokens acceptés (mapping token => bool)
    mapping(address => bool) public acceptedTokens;
    address[] public acceptedTokensList;

    /// @notice planId => Plan
    mapping(bytes32 => Plan) public plans;
    bytes32[] public planIds;

    /// @notice user => planId => expiresAt (timestamp UNIX)
    mapping(address => mapping(bytes32 => uint64)) public subscriptionExpiresAt;

    /// @notice Source des prix (référence vers WintgPriceAdmin)
    WintgPriceAdmin public priceAdmin;

    /// @notice Adresse qui reçoit les tokens (typically LiquidityReserveVault)
    address public reserveVault;

    event PlanCreated(bytes32 indexed planId, string name, uint256 priceCfa, uint64 duration, uint96 discountBps);
    event PlanUpdated(bytes32 indexed planId, uint256 priceCfa, uint96 discountBps, bool active);
    event TokenAcceptedChanged(address indexed token, bool accepted);
    event SubscriptionPaid(address indexed user, bytes32 indexed planId, address indexed token, uint256 tokenAmount, uint256 cfaEquivalent, uint64 newExpiresAt);
    event ReserveVaultChanged(address indexed previous, address indexed current);
    event PriceAdminChanged(address indexed previous, address indexed current);

    error InvalidParams();
    error PlanNotFound();
    error PlanInactive();
    error TokenNotAccepted();
    error InvalidDiscount();
    error PriceUnknown();

    constructor(address initialOwner, WintgPriceAdmin priceAdmin_, address reserveVault_) Ownable(initialOwner) {
        if (address(priceAdmin_) == address(0) || reserveVault_ == address(0)) revert InvalidParams();
        priceAdmin = priceAdmin_;
        reserveVault = reserveVault_;
    }

    // -------------------------------------------------------------------------
    // Owner — plan management
    // -------------------------------------------------------------------------

    function createPlan(
        bytes32 planId, string calldata name, uint256 priceCfa,
        uint64 durationSeconds, uint96 discountBps
    ) external onlyOwner {
        if (priceCfa == 0 || durationSeconds == 0) revert InvalidParams();
        if (discountBps > MAX_DISCOUNT_BPS) revert InvalidDiscount();
        if (plans[planId].exists) revert InvalidParams();
        plans[planId] = Plan({
            name: name, priceCfa: priceCfa,
            durationSeconds: durationSeconds, cryptoDiscountBps: discountBps,
            active: true, exists: true
        });
        planIds.push(planId);
        emit PlanCreated(planId, name, priceCfa, durationSeconds, discountBps);
    }

    function updatePlan(bytes32 planId, uint256 priceCfa, uint96 discountBps, bool active) external onlyOwner {
        Plan storage p = plans[planId];
        if (!p.exists) revert PlanNotFound();
        if (discountBps > MAX_DISCOUNT_BPS) revert InvalidDiscount();
        p.priceCfa = priceCfa;
        p.cryptoDiscountBps = discountBps;
        p.active = active;
        emit PlanUpdated(planId, priceCfa, discountBps, active);
    }

    function setAcceptedToken(address token, bool accepted) external onlyOwner {
        if (accepted && !acceptedTokens[token]) acceptedTokensList.push(token);
        acceptedTokens[token] = accepted;
        emit TokenAcceptedChanged(token, accepted);
    }

    function setReserveVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert InvalidParams();
        address prev = reserveVault;
        reserveVault = newVault;
        emit ReserveVaultChanged(prev, newVault);
    }

    function setPriceAdmin(WintgPriceAdmin newAdmin) external onlyOwner {
        if (address(newAdmin) == address(0)) revert InvalidParams();
        address prev = address(priceAdmin);
        priceAdmin = newAdmin;
        emit PriceAdminChanged(prev, address(newAdmin));
    }

    // -------------------------------------------------------------------------
    // External — pay subscription
    // -------------------------------------------------------------------------

    /**
     * @notice Paye un abonnement avec un token crypto. Le user reçoit le
     *         discount (si discountBps > 0). Les tokens vont au reserveVault.
     */
    function paySubscription(bytes32 planId, address token) external nonReentrant {
        Plan storage p = plans[planId];
        if (!p.exists) revert PlanNotFound();
        if (!p.active) revert PlanInactive();
        if (!acceptedTokens[token]) revert TokenNotAccepted();

        uint256 cfaEquivalent = p.priceCfa * (10_000 - p.cryptoDiscountBps) / 10_000;
        uint256 tokenAmount = priceAdmin.convertCfaToToken(token, cfaEquivalent);
        if (tokenAmount == 0) revert PriceUnknown();

        IERC20(token).safeTransferFrom(msg.sender, reserveVault, tokenAmount);

        // Extend / start the subscription
        uint64 currentExp = subscriptionExpiresAt[msg.sender][planId];
        uint64 base = currentExp > block.timestamp ? currentExp : uint64(block.timestamp);
        uint64 newExp = base + p.durationSeconds;
        subscriptionExpiresAt[msg.sender][planId] = newExp;

        emit SubscriptionPaid(msg.sender, planId, token, tokenAmount, cfaEquivalent, newExp);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function isSubscribed(address user, bytes32 planId) external view returns (bool) {
        return subscriptionExpiresAt[user][planId] > block.timestamp;
    }

    function quote(bytes32 planId, address token) external view returns (uint256 tokenAmount, uint256 cfaEquivalent) {
        Plan storage p = plans[planId];
        if (!p.exists || !p.active || !acceptedTokens[token]) return (0, 0);
        cfaEquivalent = p.priceCfa * (10_000 - p.cryptoDiscountBps) / 10_000;
        tokenAmount = priceAdmin.convertCfaToToken(token, cfaEquivalent);
    }

    function plansCount() external view returns (uint256) { return planIds.length; }
    function acceptedTokensCount() external view returns (uint256) { return acceptedTokensList.length; }
}
