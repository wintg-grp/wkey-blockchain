// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IWINTGFactory {
    function feeTo() external view returns (address);
}

/**
 * @title  WINTGPair (Uniswap V2-compatible AMM pair)
 * @author WINTG Team
 * @notice Pool de liquidité constant-product (x*y=k) pour deux tokens ERC-20.
 *         LP tokens représentent la part de la pool.
 *
 *         Frais : 0.30 % par swap (1/6 reversé au protocole si feeTo activé,
 *         soit 0.05 % protocole + 0.25 % LP, comme Uniswap V2).
 *
 * @dev    Audit-aware reimplementation. Logique math identique à Uniswap V2.
 */
contract WINTGPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public immutable factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32  private blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public kLast;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In, uint256 amount1In,
        uint256 amount0Out, uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    error AlreadyInitialized();
    error OnlyFactory();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidTo();
    error InsufficientInputAmount();
    error K();              // invariant violation
    error Overflow();

    constructor() ERC20("WINTG-LP", "WINTG-LP") {
        factory = msg.sender;
    }

    /// @notice Initialise la pair (appel unique par la factory).
    function initialize(address _token0, address _token1) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (token0 != address(0)) revert AlreadyInitialized();
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() public view returns (uint112 _r0, uint112 _r1, uint32 _ts) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    // -------------------------------------------------------------------------
    // mint / burn / swap
    // -------------------------------------------------------------------------

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 _r0, uint112 _r1, ) = getReserves();
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = bal0 - _r0;
        uint256 amount1 = bal1 - _r1;

        bool feeOn = _mintFee(_r0, _r1);
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdEaD), MINIMUM_LIQUIDITY);  // lock permanent
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _r0,
                (amount1 * _totalSupply) / _r1
            );
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);

        _update(bal0, bal1, _r0, _r1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        (uint112 _r0, uint112 _r1, ) = getReserves();
        address _t0 = token0;
        address _t1 = token1;
        uint256 bal0 = IERC20(_t0).balanceOf(address(this));
        uint256 bal1 = IERC20(_t1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        bool feeOn = _mintFee(_r0, _r1);
        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * bal0) / _totalSupply;
        amount1 = (liquidity * bal1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        IERC20(_t0).safeTransfer(to, amount0);
        IERC20(_t1).safeTransfer(to, amount1);

        bal0 = IERC20(_t0).balanceOf(address(this));
        bal1 = IERC20(_t1).balanceOf(address(this));
        _update(bal0, bal1, _r0, _r1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data)
        external nonReentrant
    {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 _r0, uint112 _r1, ) = getReserves();
        if (amount0Out >= _r0 || amount1Out >= _r1) revert InsufficientLiquidity();

        uint256 bal0;
        uint256 bal1;
        {
            address _t0 = token0;
            address _t1 = token1;
            if (to == _t0 || to == _t1) revert InvalidTo();
            if (amount0Out > 0) IERC20(_t0).safeTransfer(to, amount0Out);
            if (amount1Out > 0) IERC20(_t1).safeTransfer(to, amount1Out);
            if (data.length > 0) {
                IWINTGCallee(to).winntgCall(msg.sender, amount0Out, amount1Out, data);
            }
            bal0 = IERC20(_t0).balanceOf(address(this));
            bal1 = IERC20(_t1).balanceOf(address(this));
        }
        uint256 amount0In = bal0 > _r0 - amount0Out ? bal0 - (_r0 - amount0Out) : 0;
        uint256 amount1In = bal1 > _r1 - amount1Out ? bal1 - (_r1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();
        {
            // 0.30 % fee : balanceAdjusted = bal*1000 - amountIn*3
            uint256 bal0Adj = (bal0 * 1000) - (amount0In * 3);
            uint256 bal1Adj = (bal1 * 1000) - (amount1In * 3);
            if (bal0Adj * bal1Adj < uint256(_r0) * uint256(_r1) * (1000 ** 2)) revert K();
        }
        _update(bal0, bal1, _r0, _r1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Force la balance des tokens à matcher les réserves.
    function skim(address to) external nonReentrant {
        address _t0 = token0;
        address _t1 = token1;
        IERC20(_t0).safeTransfer(to, IERC20(_t0).balanceOf(address(this)) - reserve0);
        IERC20(_t1).safeTransfer(to, IERC20(_t1).balanceOf(address(this)) - reserve1);
    }

    /// @notice Force les réserves à matcher la balance des tokens.
    function sync() external nonReentrant {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _update(uint256 bal0, uint256 bal1, uint112 _r0, uint112 _r1) internal {
        if (bal0 > type(uint112).max || bal1 > type(uint112).max) revert Overflow();
        uint32 blockTs = uint32(block.timestamp);
        unchecked {
            uint32 elapsed = blockTs - blockTimestampLast;
            if (elapsed > 0 && _r0 != 0 && _r1 != 0) {
                price0CumulativeLast += uint256(uint112((uint256(_r1) << 112) / _r0)) * elapsed;
                price1CumulativeLast += uint256(uint112((uint256(_r0) << 112) / _r1)) * elapsed;
            }
        }
        reserve0 = uint112(bal0);
        reserve1 = uint112(bal1);
        blockTimestampLast = blockTs;
        emit Sync(reserve0, reserve1);
    }

    /// @dev Mint des LP tokens au feeTo (1/6 du fee de swap, ~0.05 %).
    function _mintFee(uint112 _r0, uint112 _r1) private returns (bool feeOn) {
        address feeTo = IWINTGFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = Math.sqrt(uint256(_r0) * uint256(_r1));
                uint256 rootKLast = Math.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply() * (rootK - rootKLast);
                    uint256 denominator = (rootK * 5) + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }
}

interface IWINTGCallee {
    function winntgCall(address sender, uint256 a0, uint256 a1, bytes calldata data) external;
}
