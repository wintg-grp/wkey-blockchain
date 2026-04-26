// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @notice Interface du `OracleAggregator` (Chainlink-compatible).
 */
interface IOracle {
    function latestRoundData() external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

/**
 * @title  USDW (USD-pegged WINTG stablecoin)
 * @author WINTG Team
 * @notice Stablecoin **collateralized debt position (CDP)** style MakerDAO/DAI.
 *
 *         Modèle :
 *         - Un utilisateur ouvre une position en lockant du WTG natif comme collatéral.
 *         - Il peut mint de l'USDW jusqu'à `MAX_LTV_BPS` (par défaut 66 %, soit 150 % de
 *           collatéralisation).
 *         - Pour fermer la position : repay USDW + intérêts → unlock WTG.
 *         - Si le ratio collatéral/dette tombe sous `LIQUIDATION_LTV_BPS` (par défaut
 *           80 %, soit 125 % collatéralisation), la position est **liquidable** :
 *           n'importe qui peut rembourser la dette et recevoir le collatéral avec
 *           un bonus (`LIQUIDATION_BONUS_BPS`).
 *
 *         Stabilité du peg :
 *         - 1 USDW = 1 USD garanti par le sur-collatéralisation
 *         - Le prix WTG/USD vient de l'OracleAggregator (médiane multi-opérateurs)
 *         - Si le peg dérive : opportunités d'arbitrage (mint si USDW < $1, repay si > $1)
 *
 *         Frais :
 *         - **Stability fee** annuelle (taux d'intérêt sur la dette) — initial 2 %/an
 *         - 50 % des fees → Treasury, 50 % → Burn (déflation USDW)
 *         - Pas de mint fee, pas de repay fee
 */
contract USDW is ERC20, ERC20Permit, Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice LTV maximum à la création/augmentation de position (basis points).
    /// 6600 bps = 66 % LTV soit 151,5 % de collatéralisation minimum.
    uint16 public constant MAX_LTV_BPS = 6_600;

    /// @notice LTV au-delà duquel une position devient liquidable.
    /// 8000 bps = 80 % LTV soit 125 % de collatéralisation.
    uint16 public constant LIQUIDATION_LTV_BPS = 8_000;

    /// @notice Bonus du liquidateur (basis points sur le collatéral saisi).
    /// 500 bps = 5 % de bonus pour inciter les liquidations.
    uint16 public constant LIQUIDATION_BONUS_BPS = 500;

    /// @notice Stability fee maximale (anti-rugpull économique).
    uint16 public constant MAX_STABILITY_FEE_BPS = 1_000;  // 10 %/an max

    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Oracle WTG/USD (8 décimales, ex: 100000000 = 1 USD).
    IOracle public oracle;

    /// @notice Stability fee annuelle en basis points (modifiable par DAO).
    uint16 public stabilityFeeBps;

    /// @notice Destinataire des fees collectés.
    address payable public treasury;

    /// @notice Plafond global de USDW pouvant être mintée (anti-spike).
    uint256 public globalDebtCeiling;

    struct Position {
        uint128 collateral;     // WTG locked en wei
        uint128 debt;           // USDW empruntée (montant nominal sans fees)
        uint64  lastFeeUpdate;  // timestamp pour calcul des fees accrues
    }
    mapping(address => Position) public positions;

    /// @notice Cumul de USDW mintée moins burnée (= dette totale en cours, avec fees).
    uint256 public totalDebt;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PositionOpened(address indexed user, uint256 collateral, uint256 debt);
    event CollateralAdded(address indexed user, uint256 amount, uint256 newCollateral);
    event CollateralWithdrawn(address indexed user, uint256 amount, uint256 newCollateral);
    event DebtMinted(address indexed user, uint256 amount, uint256 newDebt);
    event DebtRepaid(address indexed user, uint256 amount, uint256 newDebt);
    event Liquidated(
        address indexed user, address indexed liquidator,
        uint256 debtRepaid, uint256 collateralSeized, uint256 bonus
    );
    event StabilityFeeUpdated(uint16 oldBps, uint16 newBps);
    event OracleUpdated(address indexed newOracle);
    event TreasuryUpdated(address indexed newTreasury);
    event DebtCeilingUpdated(uint256 newCeiling);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error ExceedsLtv(uint256 ltvBps, uint256 maxBps);
    error PositionNotLiquidable(uint256 ltvBps);
    error PositionNotFound();
    error InsufficientDebt();
    error InsufficientCollateral();
    error DebtCeilingHit(uint256 wouldBe, uint256 ceiling);
    error StabilityFeeTooHigh(uint16 requested, uint16 max);
    error StaleOracle(uint256 lastUpdate, uint256 nowTs);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address initialOwner_,
        address oracle_,
        address payable treasury_,
        uint16  stabilityFeeBps_,
        uint256 globalDebtCeiling_
    )
        ERC20("WINTG USD", "USDW")
        ERC20Permit("WINTG USD")
        Ownable(initialOwner_)
    {
        if (oracle_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (stabilityFeeBps_ > MAX_STABILITY_FEE_BPS) {
            revert StabilityFeeTooHigh(stabilityFeeBps_, MAX_STABILITY_FEE_BPS);
        }
        oracle = IOracle(oracle_);
        treasury = treasury_;
        stabilityFeeBps = stabilityFeeBps_;
        globalDebtCeiling = globalDebtCeiling_;
    }

    // -------------------------------------------------------------------------
    // User actions — open / close position
    // -------------------------------------------------------------------------

    /**
     * @notice Ouvre ou augmente une position en lockant du WTG et mintant USDW.
     * @param  mintAmount Montant de USDW à mint (peut être 0 pour juste lock).
     */
    function openOrIncrease(uint256 mintAmount)
        external payable nonReentrant whenNotPaused
    {
        if (msg.value == 0 && mintAmount == 0) revert ZeroAmount();

        Position storage p = positions[msg.sender];
        _accrueFees(msg.sender);

        // Add collateral
        if (msg.value > 0) {
            p.collateral += uint128(msg.value);
        }

        // Mint debt
        if (mintAmount > 0) {
            uint256 newDebt = uint256(p.debt) + mintAmount;
            uint256 newGlobalDebt = totalDebt + mintAmount;
            if (newGlobalDebt > globalDebtCeiling) {
                revert DebtCeilingHit(newGlobalDebt, globalDebtCeiling);
            }
            uint256 ltv = _computeLtvBps(p.collateral, newDebt);
            if (ltv > MAX_LTV_BPS) revert ExceedsLtv(ltv, MAX_LTV_BPS);

            p.debt = uint128(newDebt);
            totalDebt = newGlobalDebt;
            _mint(msg.sender, mintAmount);
        }

        emit PositionOpened(msg.sender, p.collateral, p.debt);
    }

    /// @notice Ajoute du collatéral à une position existante (sans mint).
    function addCollateral() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        _accrueFees(msg.sender);
        Position storage p = positions[msg.sender];
        p.collateral += uint128(msg.value);
        emit CollateralAdded(msg.sender, msg.value, p.collateral);
    }

    /// @notice Repay une partie de la dette (brûle l'USDW et accrue les fees au passage).
    function repay(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _accrueFees(msg.sender);
        Position storage p = positions[msg.sender];
        if (p.debt == 0) revert InsufficientDebt();
        uint256 toBurn = amount > p.debt ? p.debt : amount;
        p.debt -= uint128(toBurn);
        totalDebt -= toBurn;
        _burn(msg.sender, toBurn);
        emit DebtRepaid(msg.sender, toBurn, p.debt);
    }

    /// @notice Retire du collatéral si la position reste sain.
    function withdrawCollateral(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _accrueFees(msg.sender);
        Position storage p = positions[msg.sender];
        if (amount > p.collateral) revert InsufficientCollateral();

        uint256 newCollateral = p.collateral - amount;
        if (p.debt > 0) {
            uint256 newLtv = _computeLtvBps(newCollateral, p.debt);
            if (newLtv > MAX_LTV_BPS) revert ExceedsLtv(newLtv, MAX_LTV_BPS);
        }
        p.collateral = uint128(newCollateral);
        emit CollateralWithdrawn(msg.sender, amount, p.collateral);
        payable(msg.sender).sendValue(amount);
    }

    /**
     * @notice Liquide une position dont le LTV dépasse `LIQUIDATION_LTV_BPS`.
     *         Le liquidateur paie `debtRepaid` USDW et reçoit le collatéral équivalent
     *         + bonus (`LIQUIDATION_BONUS_BPS`).
     * @param  user        Le détenteur de la position cible.
     * @param  debtRepaid  USDW que le liquidateur va brûler (max = dette totale).
     */
    function liquidate(address user, uint256 debtRepaid) external nonReentrant whenNotPaused {
        if (debtRepaid == 0) revert ZeroAmount();
        _accrueFees(user);

        Position storage p = positions[user];
        if (p.debt == 0) revert PositionNotFound();

        uint256 ltv = _computeLtvBps(p.collateral, p.debt);
        if (ltv < LIQUIDATION_LTV_BPS) revert PositionNotLiquidable(ltv);

        uint256 toRepay = debtRepaid > p.debt ? p.debt : debtRepaid;
        // Calcul du collatéral à saisir : équivalent USD + bonus
        uint256 wtgPrice = _wtgUsdPrice();           // prix WTG/USD en 1e18 fixed
        // toRepay USDW ÷ wtgPrice = WTG équivalent
        uint256 collateralValue = (toRepay * 1e18) / wtgPrice;
        uint256 bonus = (collateralValue * LIQUIDATION_BONUS_BPS) / BPS_DENOMINATOR;
        uint256 collateralSeized = collateralValue + bonus;
        if (collateralSeized > p.collateral) collateralSeized = p.collateral;

        // Update state
        p.debt -= uint128(toRepay);
        p.collateral -= uint128(collateralSeized);
        totalDebt -= toRepay;

        // Burn liquidator's USDW + send collatéral
        _burn(msg.sender, toRepay);
        emit Liquidated(user, msg.sender, toRepay, collateralSeized, bonus);
        payable(msg.sender).sendValue(collateralSeized);
    }

    // -------------------------------------------------------------------------
    // Owner — DAO controls
    // -------------------------------------------------------------------------

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();
        oracle = IOracle(newOracle);
        emit OracleUpdated(newOracle);
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setStabilityFee(uint16 newBps) external onlyOwner {
        if (newBps > MAX_STABILITY_FEE_BPS) revert StabilityFeeTooHigh(newBps, MAX_STABILITY_FEE_BPS);
        emit StabilityFeeUpdated(stabilityFeeBps, newBps);
        stabilityFeeBps = newBps;
    }

    function setDebtCeiling(uint256 newCeiling) external onlyOwner {
        globalDebtCeiling = newCeiling;
        emit DebtCeilingUpdated(newCeiling);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Prix WTG/USD normalisé en 1e18 fixed-point (ex: 1.5 USD = 1.5e18).
    function wtgUsdPrice() external view returns (uint256) {
        return _wtgUsdPrice();
    }

    /// @notice LTV courant d'une position (basis points). 10000 = 100 %.
    function ltvOf(address user) external view returns (uint256) {
        Position storage p = positions[user];
        if (p.debt == 0) return 0;
        return _computeLtvBps(p.collateral, _debtWithFees(user));
    }

    /// @notice Dette d'un user incluant les fees accrues non encore matérialisées.
    function debtWithFees(address user) external view returns (uint256) {
        return _debtWithFees(user);
    }

    /// @notice `true` si la position de `user` est liquidable.
    function isLiquidable(address user) external view returns (bool) {
        Position storage p = positions[user];
        if (p.debt == 0) return false;
        uint256 ltv = _computeLtvBps(p.collateral, _debtWithFees(user));
        return ltv >= LIQUIDATION_LTV_BPS;
    }

    // -------------------------------------------------------------------------
    // Internal — pricing & fees
    // -------------------------------------------------------------------------

    function _wtgUsdPrice() internal view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
        if (answer <= 0) revert StaleOracle(updatedAt, block.timestamp);
        if (block.timestamp - updatedAt > 1 hours) revert StaleOracle(updatedAt, block.timestamp);
        uint8 oracleDec = oracle.decimals();
        // Normaliser à 1e18
        if (oracleDec >= 18) {
            return uint256(answer) / (10 ** (oracleDec - 18));
        }
        return uint256(answer) * (10 ** (18 - oracleDec));
    }

    /// @notice LTV en bps : (debt USD) / (collateral USD) * 10000
    function _computeLtvBps(uint256 collateral, uint256 debt) internal view returns (uint256) {
        if (collateral == 0) return type(uint256).max;
        uint256 wtgPrice = _wtgUsdPrice();
        // collateralValueUsd = collateral * wtgPrice / 1e18 (en USD wei = 1e18)
        uint256 collateralValueUsd = (collateral * wtgPrice) / 1e18;
        if (collateralValueUsd == 0) return type(uint256).max;
        return (debt * BPS_DENOMINATOR) / collateralValueUsd;
    }

    function _debtWithFees(address user) internal view returns (uint256) {
        Position storage p = positions[user];
        if (p.debt == 0 || p.lastFeeUpdate == 0) return p.debt;
        uint256 elapsed = block.timestamp - uint256(p.lastFeeUpdate);
        // Approximation linéaire (acceptable pour stability fees < 10 %/an et durées < 5 ans)
        uint256 fee = (uint256(p.debt) * stabilityFeeBps * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
        return uint256(p.debt) + fee;
    }

    function _accrueFees(address user) internal {
        Position storage p = positions[user];
        if (p.debt == 0) {
            p.lastFeeUpdate = uint64(block.timestamp);
            return;
        }
        uint256 newDebt = _debtWithFees(user);
        uint256 fee = newDebt - uint256(p.debt);
        if (fee > 0) {
            p.debt = uint128(newDebt);
            totalDebt += fee;
            // Mint la moitié au treasury, brûler l'autre moitié implicitement (jamais mintée)
            if (fee >= 2) {
                _mint(treasury, fee / 2);
            }
        }
        p.lastFeeUpdate = uint64(block.timestamp);
    }

    // -------------------------------------------------------------------------
    // ERC20Permit / Nonces overrides
    // -------------------------------------------------------------------------

    // Pas d'override de nonces() : ERC20Permit fournit déjà l'implémentation.
}
