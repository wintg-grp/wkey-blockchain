// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IWINTGPair} from "./interfaces/IWINTGPair.sol";
import {IWWTG} from "./interfaces/IWWTG.sol";

interface IWINTGFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

/**
 * @title  WINTGRouter
 * @author WINTG Team
 * @notice Router DEX (Uniswap V2-compatible). Wrap les opérations utilisateur :
 *         - addLiquidity / removeLiquidity (avec / sans WTG natif via WWTG)
 *         - swapExactTokensForTokens / swapTokensForExactTokens
 *         - swapExactWTGForTokens / swapTokensForExactWTG (auto-wrap/unwrap)
 *         - Slippage et deadline protection
 */
contract WINTGRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public immutable WWTG;

    error Expired();
    error InsufficientAAmount();
    error InsufficientBAmount();
    error InsufficientOutputAmount();
    error ExcessiveInputAmount();
    error InvalidPath();
    error TransferFailed();
    error PairNotFound();

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    constructor(address _factory, address _wwtg) {
        factory = _factory;
        WWTG = _wwtg;
    }

    receive() external payable {
        // Seul WWTG peut nous envoyer des WTG natifs (lors d'unwrap)
        require(msg.sender == WWTG);
    }

    // -------------------------------------------------------------------------
    // ADD LIQUIDITY
    // -------------------------------------------------------------------------

    function _addLiquidity(
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256 amountAMin, uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        if (IWINTGFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IWINTGFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = _getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOpt = (amountADesired * reserveB) / reserveA;
            if (amountBOpt <= amountBDesired) {
                if (amountBOpt < amountBMin) revert InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOpt);
            } else {
                uint256 amountAOpt = (amountBDesired * reserveA) / reserveB;
                if (amountAOpt > amountADesired) revert InsufficientAAmount();
                if (amountAOpt < amountAMin) revert InsufficientAAmount();
                (amountA, amountB) = (amountAOpt, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = IWINTGFactory(factory).getPair(tokenA, tokenB);
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = IWINTGPair(pair).mint(to);
    }

    function addLiquidityWTG(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountWTGMin,
        address to, uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256 amountToken, uint256 amountWTG, uint256 liquidity) {
        (amountToken, amountWTG) = _addLiquidity(token, WWTG, amountTokenDesired, msg.value, amountTokenMin, amountWTGMin);
        address pair = IWINTGFactory(factory).getPair(token, WWTG);
        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        IWWTG(WWTG).deposit{value: amountWTG}();
        IERC20(WWTG).safeTransfer(pair, amountWTG);
        liquidity = IWINTGPair(pair).mint(to);
        if (msg.value > amountWTG) {
            (bool ok, ) = msg.sender.call{value: msg.value - amountWTG}("");
            if (!ok) revert TransferFailed();
        }
    }

    // -------------------------------------------------------------------------
    // REMOVE LIQUIDITY
    // -------------------------------------------------------------------------

    function removeLiquidity(
        address tokenA, address tokenB,
        uint256 liquidity, uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) public ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB) {
        return _removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to);
    }

    function _removeLiquidity(
        address tokenA, address tokenB,
        uint256 liquidity, uint256 amountAMin, uint256 amountBMin,
        address to
    ) internal returns (uint256 amountA, uint256 amountB) {
        address pair = IWINTGFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound();
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IWINTGPair(pair).burn(to);
        (address token0, ) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    function removeLiquidityWTG(
        address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountWTGMin,
        address to, uint256 deadline
    ) public ensure(deadline) nonReentrant returns (uint256 amountToken, uint256 amountWTG) {
        (amountToken, amountWTG) = _removeLiquidity(token, WWTG, liquidity, amountTokenMin, amountWTGMin, address(this));
        IERC20(token).safeTransfer(to, amountToken);
        IWWTG(WWTG).withdraw(amountWTG);
        (bool ok, ) = to.call{value: amountWTG}("");
        if (!ok) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // SWAP
    // -------------------------------------------------------------------------

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = _sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? IWINTGFactory(factory).getPair(output, path[i + 2])
                : _to;
            IWINTGPair(IWINTGFactory(factory).getPair(input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn, uint256 amountOutMin,
        address[] calldata path, address to, uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut, uint256 amountInMax,
        address[] calldata path, address to, uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactWTGForTokens(
        uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path[0] != WWTG) revert InvalidPath();
        amounts = getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IWWTG(WWTG).deposit{value: amounts[0]}();
        IERC20(WWTG).safeTransfer(IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactWTG(
        uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path[path.length - 1] != WWTG) revert InvalidPath();
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWWTG(WWTG).withdraw(amounts[amounts.length - 1]);
        (bool ok, ) = to.call{value: amounts[amounts.length - 1]}("");
        if (!ok) revert TransferFailed();
    }

    function swapExactTokensForWTG(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path[path.length - 1] != WWTG) revert InvalidPath();
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWWTG(WWTG).withdraw(amounts[amounts.length - 1]);
        (bool ok, ) = to.call{value: amounts[amounts.length - 1]}("");
        if (!ok) revert TransferFailed();
    }

    function swapWTGForExactTokens(
        uint256 amountOut, address[] calldata path, address to, uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path[0] != WWTG) revert InvalidPath();
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > msg.value) revert ExcessiveInputAmount();
        IWWTG(WWTG).deposit{value: amounts[0]}();
        IERC20(WWTG).safeTransfer(IWINTGFactory(factory).getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) {
            (bool ok, ) = msg.sender.call{value: msg.value - amounts[0]}("");
            if (!ok) revert TransferFailed();
        }
    }

    // -------------------------------------------------------------------------
    // Math helpers (Uniswap V2)
    // -------------------------------------------------------------------------

    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "WINTG: IDENTICAL");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "WINTG: ZERO_ADDRESS");
    }

    function _getReserves(address _factory, address tokenA, address tokenB)
        internal view returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0, ) = _sortTokens(tokenA, tokenB);
        address pair = IWINTGFactory(_factory).getPair(tokenA, tokenB);
        (uint112 r0, uint112 r1, ) = IWINTGPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256) {
        require(amountA > 0 && reserveA > 0 && reserveB > 0, "WINTG: INSUFFICIENT");
        return (amountA * reserveB) / reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256)
    {
        require(amountIn > 0 && reserveIn > 0 && reserveOut > 0, "WINTG: INSUFFICIENT");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256)
    {
        require(amountOut > 0 && reserveIn > 0 && reserveOut > 0, "WINTG: INSUFFICIENT");
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        return (numerator / denominator) + 1;
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public view returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "WINTG: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public view returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "WINTG: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }
}
