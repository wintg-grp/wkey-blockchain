// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WintgPriceAdmin}       from "../payment/WintgPriceAdmin.sol";

/**
 * @title  USDWVault
 * @author WINTG Team
 * @notice Coffre collatéralisé permettant à un user de **lock du WTG**
 *         pour **minter des USDW** (stablecoin USD) avec un ratio 150 %.
 *
 *         Phase 1 (Pre-DEX) : utilise `WintgPriceAdmin` pour le prix WTG.
 *         Phase 2 : on basculera sur un oracle DEX TWAP.
 *
 *         Mécanique :
 *           - User dépose 150 $ équivalent en WTG → mint 100 USDW
 *           - User rembourse 100 USDW + intérêts → récupère son WTG
 *           - Si prix WTG chute et ratio < 130 % → liquidation publique
 *             (penalty 10 % au treasury)
 *
 *         Pour minter sans devoir code-burn USDW :
 *           - le contrat doit avoir `MINTER_ROLE` sur `USDWToken`
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
interface IMintBurnable {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
}

contract USDWVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Ratio de collat min (150 %)
    uint256 public constant MIN_CR_BPS = 15_000;
    /// @notice Seuil de liquidation (130 %)
    uint256 public constant LIQ_CR_BPS = 13_000;
    /// @notice Pénalité de liquidation (10 % du collat)
    uint256 public constant LIQ_PENALTY_BPS = 1_000;
    /// @notice Stability fee (intérêt sur emprunt) — 2 % / an en bps
    uint256 public constant STABILITY_FEE_BPS_PER_YEAR = 200;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    IERC20            public immutable wtg;
    IMintBurnable     public immutable usdw;
    WintgPriceAdmin   public priceAdmin;
    address           public treasury;

    /// @notice Cap supply USDW total mintable par ce vault.
    uint256 public mintCap;
    uint256 public totalDebt; // total USDW emprunté en circulation

    struct Position {
        uint256 collateral;     // WTG locké (wei)
        uint256 debt;           // USDW emprunté (wei)
        uint64  lastFeeAccrual; // timestamp dernier calcul d'intérêt
    }

    /// @notice user => Position
    mapping(address => Position) public positions;

    event Deposited(address indexed user, uint256 amount);
    event Minted(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount, uint256 fee);
    event Withdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 collatSeized, uint256 debtCleared, uint256 penaltyToTreasury);
    event MintCapChanged(uint256 newCap);
    event PriceAdminChanged(address indexed previous, address indexed current);
    event TreasuryChanged(address indexed previous, address indexed current);

    error InvalidParams();
    error MintCapExceeded(uint256 want, uint256 cap);
    error CollateralRatioTooLow(uint256 actual, uint256 required);
    error InsufficientCollateral();
    error InsufficientDebt();
    error PositionHealthy();
    error PriceUnknown();
    error TransferFailed();

    constructor(
        address initialOwner,
        IERC20 wtg_,
        IMintBurnable usdw_,
        WintgPriceAdmin priceAdmin_,
        address initialTreasury,
        uint256 initialMintCap
    ) Ownable(initialOwner) {
        if (address(wtg_) == address(0) || address(usdw_) == address(0)
            || address(priceAdmin_) == address(0) || initialTreasury == address(0)) revert InvalidParams();
        wtg = wtg_;
        usdw = usdw_;
        priceAdmin = priceAdmin_;
        treasury = initialTreasury;
        mintCap = initialMintCap;
    }

    // -------------------------------------------------------------------------
    // User operations
    // -------------------------------------------------------------------------

    /// @notice Dépose du WTG comme collat (sans minter d'USDW).
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidParams();
        wtg.safeTransferFrom(msg.sender, address(this), amount);
        positions[msg.sender].collateral += amount;
        if (positions[msg.sender].lastFeeAccrual == 0) {
            positions[msg.sender].lastFeeAccrual = uint64(block.timestamp);
        }
        emit Deposited(msg.sender, amount);
    }

    /// @notice Minte des USDW contre le collat. Vérifie le CR ≥ 150%.
    function mintUSDW(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidParams();
        if (totalDebt + amount > mintCap) revert MintCapExceeded(totalDebt + amount, mintCap);
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        p.debt += amount;
        totalDebt += amount;
        _checkCR(p);
        usdw.mint(msg.sender, amount);
        emit Minted(msg.sender, amount);
    }

    /// @notice Rembourse une partie ou la totalité de la dette + intérêts.
    function repay(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        if (amount > p.debt) amount = p.debt;
        if (amount == 0) revert InsufficientDebt();
        usdw.burnFrom(msg.sender, amount);
        p.debt -= amount;
        totalDebt -= amount;
        emit Repaid(msg.sender, amount, 0);
    }

    /// @notice Retire du collat — ne peut casser le CR.
    function withdraw(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        if (amount > p.collateral) revert InsufficientCollateral();
        p.collateral -= amount;
        if (p.debt > 0) _checkCR(p); // si debt = 0, on retire tout
        wtg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Liquide une position dont le CR est tombé < 130%.
     *         Le liquidateur paie la dette en USDW et reçoit le collat
     *         + une pénalité 10% (qui va au treasury).
     */
    function liquidate(address user) external nonReentrant {
        Position storage p = positions[user];
        _accrueFee(p);
        uint256 cr = _currentCR(p);
        if (cr >= LIQ_CR_BPS) revert PositionHealthy();
        uint256 debt = p.debt;
        uint256 collat = p.collateral;
        // Liquidator burns USDW for the user's debt
        usdw.burnFrom(msg.sender, debt);
        totalDebt -= debt;
        // Penalty 10 % to treasury
        uint256 penalty = (collat * LIQ_PENALTY_BPS) / 10_000;
        uint256 toLiquidator = collat - penalty;
        wtg.safeTransfer(msg.sender, toLiquidator);
        wtg.safeTransfer(treasury, penalty);
        // Wipe position
        p.collateral = 0;
        p.debt = 0;
        emit Liquidated(user, msg.sender, toLiquidator, debt, penalty);
    }

    // -------------------------------------------------------------------------
    // Internal — fees + CR
    // -------------------------------------------------------------------------

    function _accrueFee(Position storage p) internal {
        if (p.debt == 0 || p.lastFeeAccrual == 0) {
            p.lastFeeAccrual = uint64(block.timestamp);
            return;
        }
        uint256 elapsed = block.timestamp - p.lastFeeAccrual;
        uint256 fee = (p.debt * STABILITY_FEE_BPS_PER_YEAR * elapsed) / (SECONDS_PER_YEAR * 10_000);
        p.debt += fee;
        totalDebt += fee;
        p.lastFeeAccrual = uint64(block.timestamp);
    }

    function _checkCR(Position storage p) internal view {
        uint256 cr = _currentCR(p);
        if (cr < MIN_CR_BPS) revert CollateralRatioTooLow(cr, MIN_CR_BPS);
    }

    function _currentCR(Position storage p) internal view returns (uint256) {
        if (p.debt == 0) return type(uint256).max;
        // Convert collat WTG → CFA → USD comparison
        // cfaCollat = priceAdmin.convertTokenToCfa(WTG, collateral)
        uint256 cfaCollat = priceAdmin.convertTokenToCfa(address(wtg), p.collateral);
        // USDW → CFA at 600 CFA/USDW
        uint256 cfaDebt = priceAdmin.convertTokenToCfa(address(usdw), p.debt);
        if (cfaDebt == 0) return type(uint256).max;
        return (cfaCollat * 10_000) / cfaDebt;
    }

    function currentCR(address user) external view returns (uint256) {
        return _currentCR(positions[user]);
    }

    // -------------------------------------------------------------------------
    // Owner
    // -------------------------------------------------------------------------

    function setMintCap(uint256 cap) external onlyOwner {
        mintCap = cap;
        emit MintCapChanged(cap);
    }

    function setPriceAdmin(WintgPriceAdmin newAdmin) external onlyOwner {
        if (address(newAdmin) == address(0)) revert InvalidParams();
        address prev = address(priceAdmin);
        priceAdmin = newAdmin;
        emit PriceAdminChanged(prev, address(newAdmin));
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address prev = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(prev, newTreasury);
    }
}
