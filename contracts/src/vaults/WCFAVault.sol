// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WintgPriceAdmin}       from "../payment/WintgPriceAdmin.sol";

interface IMintBurnable {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
}

/**
 * @title  WCFAVault
 * @author WINTG Team
 * @notice Coffre collatéralisé permettant à un user de **lock du WTG**
 *         pour **minter des WCFA** (stablecoin franc CFA) avec un ratio 150 %.
 *
 *         Identique à USDWVault mais peg sur le franc CFA.
 *         Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract WCFAVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_CR_BPS = 15_000;
    uint256 public constant LIQ_CR_BPS = 13_000;
    uint256 public constant LIQ_PENALTY_BPS = 1_000;
    uint256 public constant STABILITY_FEE_BPS_PER_YEAR = 200;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    IERC20            public immutable wtg;
    IMintBurnable     public immutable wcfa;
    WintgPriceAdmin   public priceAdmin;
    address           public treasury;

    uint256 public mintCap;
    uint256 public totalDebt;

    struct Position {
        uint256 collateral;
        uint256 debt;
        uint64  lastFeeAccrual;
    }

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
    error TransferFailed();

    constructor(
        address initialOwner,
        IERC20 wtg_,
        IMintBurnable wcfa_,
        WintgPriceAdmin priceAdmin_,
        address initialTreasury,
        uint256 initialMintCap
    ) Ownable(initialOwner) {
        if (address(wtg_) == address(0) || address(wcfa_) == address(0)
            || address(priceAdmin_) == address(0) || initialTreasury == address(0)) revert InvalidParams();
        wtg = wtg_;
        wcfa = wcfa_;
        priceAdmin = priceAdmin_;
        treasury = initialTreasury;
        mintCap = initialMintCap;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidParams();
        wtg.safeTransferFrom(msg.sender, address(this), amount);
        positions[msg.sender].collateral += amount;
        if (positions[msg.sender].lastFeeAccrual == 0) {
            positions[msg.sender].lastFeeAccrual = uint64(block.timestamp);
        }
        emit Deposited(msg.sender, amount);
    }

    function mintWCFA(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidParams();
        if (totalDebt + amount > mintCap) revert MintCapExceeded(totalDebt + amount, mintCap);
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        p.debt += amount;
        totalDebt += amount;
        _checkCR(p);
        wcfa.mint(msg.sender, amount);
        emit Minted(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        if (amount > p.debt) amount = p.debt;
        if (amount == 0) revert InsufficientDebt();
        wcfa.burnFrom(msg.sender, amount);
        p.debt -= amount;
        totalDebt -= amount;
        emit Repaid(msg.sender, amount, 0);
    }

    function withdraw(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        _accrueFee(p);
        if (amount > p.collateral) revert InsufficientCollateral();
        p.collateral -= amount;
        if (p.debt > 0) _checkCR(p);
        wtg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function liquidate(address user) external nonReentrant {
        Position storage p = positions[user];
        _accrueFee(p);
        uint256 cr = _currentCR(p);
        if (cr >= LIQ_CR_BPS) revert PositionHealthy();
        uint256 debt = p.debt;
        uint256 collat = p.collateral;
        wcfa.burnFrom(msg.sender, debt);
        totalDebt -= debt;
        uint256 penalty = (collat * LIQ_PENALTY_BPS) / 10_000;
        uint256 toLiquidator = collat - penalty;
        wtg.safeTransfer(msg.sender, toLiquidator);
        wtg.safeTransfer(treasury, penalty);
        p.collateral = 0;
        p.debt = 0;
        emit Liquidated(user, msg.sender, toLiquidator, debt, penalty);
    }

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
        uint256 cfaCollat = priceAdmin.convertTokenToCfa(address(wtg), p.collateral);
        uint256 cfaDebt = priceAdmin.convertTokenToCfa(address(wcfa), p.debt);
        if (cfaDebt == 0) return type(uint256).max;
        return (cfaCollat * 10_000) / cfaDebt;
    }

    function currentCR(address user) external view returns (uint256) {
        return _currentCR(positions[user]);
    }

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
