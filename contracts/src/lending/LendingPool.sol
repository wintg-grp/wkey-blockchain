// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IOracleAggregator {
    function latestRoundData() external view
        returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
    function decimals() external view returns (uint8);
}

/**
 * @title  LendingPool
 * @author WINTG Team
 * @notice Pool de lending simplifié style Aave V2.
 *
 *         **Marchés supportés (single pool, multiple assets) :**
 *         - WTG natif (collatéral uniquement, non empruntable initialement)
 *         - USDW stablecoin (empruntable + collatéral)
 *         - WWTG ERC20 (équivalent WTG, fongible avec USDW dans le pool)
 *
 *         **Mécanique :**
 *         - `supply(asset, amount)` : déposer pour gagner des intérêts
 *         - `withdraw(asset, amount)` : retirer
 *         - `borrow(asset, amount)` : emprunter contre collatéral
 *         - `repay(asset, amount)` : rembourser
 *         - `liquidate(user, asset, repayAmount, collateralAsset)` : liquidation si HF < 1
 *
 *         **Health Factor (HF) :**
 *           HF = totalCollateralUsd × averageLiquidationThreshold / totalDebtUsd
 *         Position liquidable si HF < 1.
 *
 *         **Taux d'intérêt (modèle linéaire simplifié) :**
 *           rate = baseRate + utilisation × slope1   (si utilisation < kink)
 *           rate = baseRate + slope1 × kink + (utilisation - kink) × slope2  (si > kink)
 *         où `utilisation = totalBorrows / totalSupply`.
 *
 *         **Limitations volontaires de cette version simplifiée :**
 *         - Pas de flash loans (peuvent être ajoutés en V2)
 *         - Pas de stable rate (variable rate uniquement)
 *         - Pas de collatéral mode "isolated"
 *         - Calcul des intérêts via index (cumulé linéairement, pas exponentiel)
 *
 *         **Sécurité :**
 *         - `ReentrancyGuard` sur toutes les state-mutating
 *         - `Pausable` global (pause d'urgence DAO)
 *         - Health factor recalculé après chaque opération
 *         - Oracles obligatoires pour tous les assets
 */
contract LendingPool is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    /// @notice Index de départ (1.0 en 1e18 fixed-point).
    uint256 public constant INDEX_START = 1e18;
    /// @notice Bonus de liquidation distribué au liquidateur (en bps).
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;     // 5 %
    /// @notice Limite max d'asset configurables (anti-DoS).
    uint256 public constant MAX_ASSETS = 32;

    /// @notice Sentinelle pour le WTG natif dans `Reserve.asset`.
    address public constant NATIVE_ASSET = address(0);

    // -------------------------------------------------------------------------
    // Storage — reserves (1 par asset)
    // -------------------------------------------------------------------------

    struct Reserve {
        uint128 totalSupply;          // total liquidity supplied (en token decimals)
        uint128 totalBorrows;         // total borrowed
        uint128 supplyIndex;          // 1e18-fixed cumulative supply rate
        uint128 borrowIndex;          // 1e18-fixed cumulative borrow rate
        uint64  lastUpdateTime;
        uint16  ltvBps;               // max LTV pour ce collatéral (ex: 7500 = 75%)
        uint16  liquidationThresholdBps; // (ex: 8500 = 85%)
        uint16  reserveFactorBps;     // % des intérêts mis en réserve protocol (ex: 1000 = 10%)
        uint16  baseRateBps;          // taux base (ex: 0 = 0%)
        uint16  slope1Bps;            // pente avant kink (ex: 400 = 4%)
        uint16  slope2Bps;            // pente après kink (ex: 6000 = 60%)
        uint16  kinkBps;              // utilisation seuil (ex: 8000 = 80%)
        bool    enabledAsCollateral;
        bool    enabledForBorrow;
        bool    isNative;             // true = WTG natif (msg.value), false = ERC20
        address oracle;               // Chainlink-compatible AggregatorV3
        uint8   oracleDecimals;
    }

    /// @notice Liste des assets supportés.
    address[] public reservesList;
    mapping(address => Reserve) public reserves;
    mapping(address => bool) public isReserveActive;

    // User positions per asset
    struct UserData {
        uint128 supplyAmount;        // supply scaled at supplyIndex when first deposited
        uint128 supplyIndexCheckpoint;
        uint128 borrowAmount;
        uint128 borrowIndexCheckpoint;
    }
    mapping(address => mapping(address => UserData)) public users;

    /// @notice Réserves accumulées par le protocol (intérêts × reserveFactor).
    mapping(address => uint256) public protocolReserves;
    address payable public treasury;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ReserveAdded(address indexed asset, bool isNative);
    event ReserveConfigUpdated(address indexed asset);
    event Supplied(address indexed user, address indexed asset, uint256 amount);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount);
    event Borrowed(address indexed user, address indexed asset, uint256 amount);
    event Repaid(address indexed user, address indexed asset, uint256 amount);
    event Liquidated(
        address indexed user, address indexed liquidator,
        address debtAsset, uint256 debtRepaid,
        address collateralAsset, uint256 collateralSeized
    );
    event ProtocolFeesCollected(address indexed asset, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error AssetNotSupported(address asset);
    error AssetAlreadyExists(address asset);
    error InsufficientBalance();
    error InsufficientLiquidity();
    error CollateralDisabled();
    error BorrowDisabled();
    error HealthFactorTooLow(uint256 hf);
    error HealthFactorOk(uint256 hf);
    error TooManyReserves();
    error MismatchedNativeValue();
    error NotLiquidable();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner_, address payable treasury_) Ownable(initialOwner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    receive() external payable {
        // Accepter les WTG natifs dans le contexte de supply / repay
    }

    // -------------------------------------------------------------------------
    // Owner — reserve management
    // -------------------------------------------------------------------------

    function addReserve(
        address asset,
        bool isNative,
        address oracle,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 reserveFactorBps,
        uint16 baseRateBps,
        uint16 slope1Bps,
        uint16 slope2Bps,
        uint16 kinkBps,
        bool enabledAsCollateral,
        bool enabledForBorrow
    ) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        if (isReserveActive[asset]) revert AssetAlreadyExists(asset);
        if (reservesList.length >= MAX_ASSETS) revert TooManyReserves();
        require(ltvBps <= liquidationThresholdBps && liquidationThresholdBps < BPS, "LP: invalid LTV");

        reserves[asset] = Reserve({
            totalSupply: 0,
            totalBorrows: 0,
            supplyIndex: uint128(INDEX_START),
            borrowIndex: uint128(INDEX_START),
            lastUpdateTime: uint64(block.timestamp),
            ltvBps: ltvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            reserveFactorBps: reserveFactorBps,
            baseRateBps: baseRateBps,
            slope1Bps: slope1Bps,
            slope2Bps: slope2Bps,
            kinkBps: kinkBps,
            enabledAsCollateral: enabledAsCollateral,
            enabledForBorrow: enabledForBorrow,
            isNative: isNative,
            oracle: oracle,
            oracleDecimals: IOracleAggregator(oracle).decimals()
        });
        isReserveActive[asset] = true;
        reservesList.push(asset);

        emit ReserveAdded(asset, isNative);
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function collectProtocolFees(address asset) external onlyOwner nonReentrant {
        uint256 amount = protocolReserves[asset];
        if (amount == 0) return;
        protocolReserves[asset] = 0;
        Reserve storage r = reserves[asset];
        if (r.isNative) {
            treasury.sendValue(amount);
        } else {
            IERC20(asset).safeTransfer(treasury, amount);
        }
        emit ProtocolFeesCollected(asset, amount);
    }

    // -------------------------------------------------------------------------
    // User actions
    // -------------------------------------------------------------------------

    function supply(address asset, uint256 amount) external payable nonReentrant whenNotPaused {
        Reserve storage r = reserves[asset];
        if (!isReserveActive[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();
        if (r.isNative != (msg.value > 0)) revert MismatchedNativeValue();
        if (r.isNative && msg.value != amount) revert MismatchedNativeValue();

        _accrue(r);
        if (!r.isNative) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }

        UserData storage u = users[msg.sender][asset];
        // Mettre à jour le checkpoint d'index
        if (u.supplyAmount > 0) {
            u.supplyAmount = uint128((uint256(u.supplyAmount) * r.supplyIndex) / u.supplyIndexCheckpoint);
        }
        u.supplyAmount += uint128(amount);
        u.supplyIndexCheckpoint = r.supplyIndex;

        r.totalSupply += uint128(amount);
        emit Supplied(msg.sender, asset, amount);
    }

    function withdraw(address asset, uint256 amount) external nonReentrant whenNotPaused {
        Reserve storage r = reserves[asset];
        if (!isReserveActive[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();

        _accrue(r);
        UserData storage u = users[msg.sender][asset];

        // Recalculer le supply avec intérêts cumulés
        uint256 currentSupply = u.supplyIndexCheckpoint == 0
            ? 0
            : (uint256(u.supplyAmount) * r.supplyIndex) / u.supplyIndexCheckpoint;
        if (amount > currentSupply) revert InsufficientBalance();

        // Vérifier la liquidité AVANT de décrémenter totalSupply
        uint256 available = uint256(r.totalSupply) - uint256(r.totalBorrows);
        if (amount > available) revert InsufficientLiquidity();

        u.supplyAmount = uint128(currentSupply - amount);
        u.supplyIndexCheckpoint = r.supplyIndex;
        r.totalSupply -= uint128(amount);

        // Vérifier que le HF reste OK après retrait
        uint256 hf = _healthFactor(msg.sender);
        if (hf < 1e18 && _hasDebt(msg.sender)) revert HealthFactorTooLow(hf);

        if (r.isNative) {
            payable(msg.sender).sendValue(amount);
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }
        emit Withdrawn(msg.sender, asset, amount);
    }

    function borrow(address asset, uint256 amount) external nonReentrant whenNotPaused {
        Reserve storage r = reserves[asset];
        if (!isReserveActive[asset]) revert AssetNotSupported(asset);
        if (!r.enabledForBorrow) revert BorrowDisabled();
        if (amount == 0) revert ZeroAmount();

        _accrue(r);

        UserData storage u = users[msg.sender][asset];
        if (u.borrowAmount > 0) {
            u.borrowAmount = uint128((uint256(u.borrowAmount) * r.borrowIndex) / u.borrowIndexCheckpoint);
        }
        // Vérifier liquidité AVANT d'incrémenter totalBorrows
        uint256 available = uint256(r.totalSupply) - uint256(r.totalBorrows);
        if (amount > available) revert InsufficientLiquidity();

        u.borrowAmount += uint128(amount);
        u.borrowIndexCheckpoint = r.borrowIndex;
        r.totalBorrows += uint128(amount);

        // Vérifier HF
        uint256 hf = _healthFactor(msg.sender);
        if (hf < 1e18) revert HealthFactorTooLow(hf);

        if (r.isNative) {
            payable(msg.sender).sendValue(amount);
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }
        emit Borrowed(msg.sender, asset, amount);
    }

    function repay(address asset, uint256 amount) external payable nonReentrant whenNotPaused {
        Reserve storage r = reserves[asset];
        if (!isReserveActive[asset]) revert AssetNotSupported(asset);
        if (amount == 0) revert ZeroAmount();
        if (r.isNative && msg.value != amount) revert MismatchedNativeValue();
        if (!r.isNative && msg.value > 0) revert MismatchedNativeValue();

        _accrue(r);
        UserData storage u = users[msg.sender][asset];
        uint256 currentDebt = u.borrowIndexCheckpoint == 0
            ? 0
            : (uint256(u.borrowAmount) * r.borrowIndex) / u.borrowIndexCheckpoint;
        uint256 toRepay = amount > currentDebt ? currentDebt : amount;
        if (toRepay == 0) return;

        if (!r.isNative) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), toRepay);
        }

        u.borrowAmount = uint128(currentDebt - toRepay);
        u.borrowIndexCheckpoint = r.borrowIndex;
        r.totalBorrows -= uint128(toRepay);

        // Refund excess pour native
        if (r.isNative && msg.value > toRepay) {
            payable(msg.sender).sendValue(msg.value - toRepay);
        }
        emit Repaid(msg.sender, asset, toRepay);
    }

    /**
     * @notice Liquide une position non-saine.
     * @param  user             Compte cible
     * @param  debtAsset        Asset emprunté à rembourser
     * @param  debtRepaid       Montant que le liquidateur paie
     * @param  collateralAsset  Asset collatéral à saisir
     */
    function liquidate(
        address user,
        address debtAsset,
        uint256 debtRepaid,
        address collateralAsset
    ) external payable nonReentrant whenNotPaused {
        if (debtRepaid == 0) revert ZeroAmount();
        if (!isReserveActive[debtAsset]) revert AssetNotSupported(debtAsset);
        if (!isReserveActive[collateralAsset]) revert AssetNotSupported(collateralAsset);

        Reserve storage rDebt = reserves[debtAsset];
        Reserve storage rColl = reserves[collateralAsset];
        _accrue(rDebt);
        _accrue(rColl);

        uint256 hf = _healthFactor(user);
        if (hf >= 1e18) revert NotLiquidable();

        UserData storage uDebt = users[user][debtAsset];
        uint256 currentDebt = uDebt.borrowIndexCheckpoint == 0
            ? 0
            : (uint256(uDebt.borrowAmount) * rDebt.borrowIndex) / uDebt.borrowIndexCheckpoint;
        uint256 toRepay = debtRepaid > currentDebt ? currentDebt : debtRepaid;

        // Receive debt repayment
        if (rDebt.isNative) {
            if (msg.value < toRepay) revert MismatchedNativeValue();
        } else {
            IERC20(debtAsset).safeTransferFrom(msg.sender, address(this), toRepay);
        }

        // Calculate collateral seizure (with bonus)
        uint256 debtPriceUsd = _priceUsd(debtAsset);
        uint256 collateralPriceUsd = _priceUsd(collateralAsset);
        // collateralAmount = (debtRepaid × debtPrice / collateralPrice) × (1 + bonus)
        uint256 collateralValue = (toRepay * debtPriceUsd) / collateralPriceUsd;
        uint256 bonus = (collateralValue * LIQUIDATION_BONUS_BPS) / BPS;
        uint256 collateralSeized = collateralValue + bonus;

        UserData storage uColl = users[user][collateralAsset];
        uint256 currentColl = uColl.supplyIndexCheckpoint == 0
            ? 0
            : (uint256(uColl.supplyAmount) * rColl.supplyIndex) / uColl.supplyIndexCheckpoint;
        if (collateralSeized > currentColl) collateralSeized = currentColl;

        // Update positions
        uDebt.borrowAmount = uint128(currentDebt - toRepay);
        uDebt.borrowIndexCheckpoint = rDebt.borrowIndex;
        rDebt.totalBorrows -= uint128(toRepay);

        uColl.supplyAmount = uint128(currentColl - collateralSeized);
        uColl.supplyIndexCheckpoint = rColl.supplyIndex;
        rColl.totalSupply -= uint128(collateralSeized);

        // Send collateral to liquidator
        if (rColl.isNative) {
            payable(msg.sender).sendValue(collateralSeized);
        } else {
            IERC20(collateralAsset).safeTransfer(msg.sender, collateralSeized);
        }

        // Refund excess native debt repayment
        if (rDebt.isNative && msg.value > toRepay) {
            payable(msg.sender).sendValue(msg.value - toRepay);
        }

        emit Liquidated(user, msg.sender, debtAsset, toRepay, collateralAsset, collateralSeized);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getReserveCount() external view returns (uint256) {
        return reservesList.length;
    }

    function healthFactor(address user) external view returns (uint256) {
        return _healthFactor(user);
    }

    function utilization(address asset) external view returns (uint256) {
        Reserve storage r = reserves[asset];
        if (r.totalSupply == 0) return 0;
        return (uint256(r.totalBorrows) * BPS) / uint256(r.totalSupply);
    }

    /// @notice APY utilisateur courant supply / borrow (en basis points).
    function ratesBps(address asset) external view returns (uint256 supplyApy, uint256 borrowApy) {
        Reserve storage r = reserves[asset];
        uint256 util = r.totalSupply == 0 ? 0 : (uint256(r.totalBorrows) * BPS) / uint256(r.totalSupply);
        borrowApy = _computeBorrowRate(r, util);
        // supply rate = borrow * util * (1 - reserveFactor)
        supplyApy = (borrowApy * util * (BPS - r.reserveFactorBps)) / (BPS * BPS);
    }

    function userSupply(address user, address asset) external view returns (uint256) {
        Reserve storage r = reserves[asset];
        UserData storage u = users[user][asset];
        if (u.supplyIndexCheckpoint == 0) return 0;
        // Project current index
        uint256 currentIndex = _projectedSupplyIndex(r);
        return (uint256(u.supplyAmount) * currentIndex) / u.supplyIndexCheckpoint;
    }

    function userBorrow(address user, address asset) external view returns (uint256) {
        Reserve storage r = reserves[asset];
        UserData storage u = users[user][asset];
        if (u.borrowIndexCheckpoint == 0) return 0;
        uint256 currentIndex = _projectedBorrowIndex(r);
        return (uint256(u.borrowAmount) * currentIndex) / u.borrowIndexCheckpoint;
    }

    // -------------------------------------------------------------------------
    // Internal — interest accrual
    // -------------------------------------------------------------------------

    function _accrue(Reserve storage r) internal {
        uint256 elapsed = block.timestamp - uint256(r.lastUpdateTime);
        if (elapsed == 0) return;
        if (r.totalSupply == 0) {
            r.lastUpdateTime = uint64(block.timestamp);
            return;
        }

        uint256 util = (uint256(r.totalBorrows) * BPS) / uint256(r.totalSupply);
        uint256 borrowRate = _computeBorrowRate(r, util);

        // borrowGrowth = borrowRate × elapsed / SECONDS_PER_YEAR (simple linear approximation)
        uint256 borrowGrowth = (borrowRate * elapsed) / SECONDS_PER_YEAR;
        uint256 newBorrowIndex = uint256(r.borrowIndex) + (uint256(r.borrowIndex) * borrowGrowth) / BPS;

        // supplyRate = borrowRate × util × (1 - reserveFactor)
        uint256 supplyRate = (borrowRate * util * (BPS - r.reserveFactorBps)) / (BPS * BPS);
        uint256 supplyGrowth = (supplyRate * elapsed) / SECONDS_PER_YEAR;
        uint256 newSupplyIndex = uint256(r.supplyIndex) + (uint256(r.supplyIndex) * supplyGrowth) / BPS;

        // Protocol reserve = (borrow growth - supply growth) × totalSupply
        uint256 borrowInterestAccrued = (uint256(r.totalBorrows) * borrowGrowth) / BPS;
        uint256 supplyInterestAccrued = (uint256(r.totalSupply) * supplyGrowth) / BPS;
        if (borrowInterestAccrued > supplyInterestAccrued) {
            protocolReserves[address(0)] += borrowInterestAccrued - supplyInterestAccrued;
        }

        r.borrowIndex = uint128(newBorrowIndex);
        r.supplyIndex = uint128(newSupplyIndex);
        r.lastUpdateTime = uint64(block.timestamp);
    }

    function _projectedSupplyIndex(Reserve storage r) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - uint256(r.lastUpdateTime);
        if (elapsed == 0 || r.totalSupply == 0) return r.supplyIndex;
        uint256 util = (uint256(r.totalBorrows) * BPS) / uint256(r.totalSupply);
        uint256 borrowRate = _computeBorrowRate(r, util);
        uint256 supplyRate = (borrowRate * util * (BPS - r.reserveFactorBps)) / (BPS * BPS);
        uint256 growth = (supplyRate * elapsed) / SECONDS_PER_YEAR;
        return uint256(r.supplyIndex) + (uint256(r.supplyIndex) * growth) / BPS;
    }

    function _projectedBorrowIndex(Reserve storage r) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - uint256(r.lastUpdateTime);
        if (elapsed == 0 || r.totalSupply == 0) return r.borrowIndex;
        uint256 util = (uint256(r.totalBorrows) * BPS) / uint256(r.totalSupply);
        uint256 borrowRate = _computeBorrowRate(r, util);
        uint256 growth = (borrowRate * elapsed) / SECONDS_PER_YEAR;
        return uint256(r.borrowIndex) + (uint256(r.borrowIndex) * growth) / BPS;
    }

    function _computeBorrowRate(Reserve storage r, uint256 util) internal view returns (uint256) {
        if (util <= r.kinkBps) {
            return uint256(r.baseRateBps) + (util * uint256(r.slope1Bps)) / BPS;
        }
        uint256 belowKink = uint256(r.baseRateBps) + (uint256(r.kinkBps) * uint256(r.slope1Bps)) / BPS;
        return belowKink + ((util - uint256(r.kinkBps)) * uint256(r.slope2Bps)) / BPS;
    }

    function _availableLiquidity(address asset) internal view returns (uint256) {
        Reserve storage r = reserves[asset];
        if (r.isNative) {
            // address(this).balance peut inclure les pending repays — on prend totalSupply - totalBorrows
            return uint256(r.totalSupply) - uint256(r.totalBorrows);
        }
        return uint256(r.totalSupply) - uint256(r.totalBorrows);
    }

    // -------------------------------------------------------------------------
    // Internal — pricing & health factor
    // -------------------------------------------------------------------------

    function _priceUsd(address asset) internal view returns (uint256) {
        Reserve storage r = reserves[asset];
        (, int256 ans, , uint256 updatedAt, ) = IOracleAggregator(r.oracle).latestRoundData();
        require(ans > 0, "LP: bad oracle");
        require(block.timestamp - updatedAt <= 1 hours, "LP: stale oracle");
        // Normaliser à 1e18
        if (r.oracleDecimals >= 18) {
            return uint256(ans) / (10 ** (r.oracleDecimals - 18));
        }
        return uint256(ans) * (10 ** (18 - r.oracleDecimals));
    }

    function _healthFactor(address user) internal view returns (uint256) {
        uint256 totalCollateralUsd = 0;
        uint256 totalDebtUsd = 0;

        for (uint256 i = 0; i < reservesList.length; i++) {
            address asset = reservesList[i];
            Reserve storage r = reserves[asset];
            UserData storage u = users[user][asset];

            if (r.enabledAsCollateral && u.supplyIndexCheckpoint > 0) {
                uint256 currentIndex = _projectedSupplyIndex(r);
                uint256 currentSupply = (uint256(u.supplyAmount) * currentIndex) / u.supplyIndexCheckpoint;
                if (currentSupply > 0) {
                    uint256 priceUsd = _priceUsd(asset);
                    // Note: `r.liquidationThresholdBps` weighted
                    totalCollateralUsd += (currentSupply * priceUsd * r.liquidationThresholdBps) / (1e18 * BPS);
                }
            }

            if (u.borrowIndexCheckpoint > 0) {
                uint256 currentIndex = _projectedBorrowIndex(r);
                uint256 currentDebt = (uint256(u.borrowAmount) * currentIndex) / u.borrowIndexCheckpoint;
                if (currentDebt > 0) {
                    uint256 priceUsd = _priceUsd(asset);
                    totalDebtUsd += (currentDebt * priceUsd) / 1e18;
                }
            }
        }

        if (totalDebtUsd == 0) return type(uint256).max;
        // HF = collateralUsd × LT / debtUsd, with LT déjà inclus dans totalCollateralUsd
        return (totalCollateralUsd * 1e18) / totalDebtUsd;
    }

    function _hasDebt(address user) internal view returns (bool) {
        for (uint256 i = 0; i < reservesList.length; i++) {
            if (users[user][reservesList[i]].borrowAmount > 0) return true;
        }
        return false;
    }
}
