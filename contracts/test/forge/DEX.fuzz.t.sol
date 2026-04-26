// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {WINTGRouter} from "../../src/dex/WINTGRouter.sol";

/**
 * @notice Invariants AMM Uniswap V2 sous fuzzing.
 *   I1 — `getAmountOut(amountIn, rIn, rOut) <= rOut`
 *   I2 — Constant-product : (rIn + amountIn*0.997) * (rOut - amountOut) >= rIn * rOut
 *   I3 — `getAmountIn(amountOut, rIn, rOut) >= getAmountOut^-1(amountOut)`
 */
contract DEXFuzz is Test {
    WINTGRouter internal router;

    function setUp() public {
        router = new WINTGRouter(address(0xF), address(0xWWTG));
    }

    function testFuzz_AmountOutNeverExceedsReserve(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public view {
        amountIn   = bound(amountIn,   1, 1e30);
        reserveIn  = bound(reserveIn,  1e3, 1e30);
        reserveOut = bound(reserveOut, 1e3, 1e30);
        uint256 out = router.getAmountOut(amountIn, reserveIn, reserveOut);
        assertLt(out, reserveOut, "I1: out >= reserveOut");
    }

    function testFuzz_ConstantProduct(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public view {
        amountIn   = bound(amountIn,   1e6, 1e24);
        reserveIn  = bound(reserveIn,  1e9, 1e24);
        reserveOut = bound(reserveOut, 1e9, 1e24);
        uint256 out = router.getAmountOut(amountIn, reserveIn, reserveOut);
        // Avec fee 0.3 %, le invariant k_new ≥ k_old (avec ratio adjusted)
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 newReserveOut = reserveOut - out;
        uint256 kNew = newReserveIn * newReserveOut;
        uint256 kOld = reserveIn * reserveOut;
        // Le k augmente strictement à cause des fees
        assertGe(kNew, kOld, "I2: k decreased (fee leak)");
    }

    function testFuzz_GetAmountInRoundsUp(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public view {
        amountOut  = bound(amountOut, 1e6, 1e23);
        reserveIn  = bound(reserveIn,  1e9, 1e24);
        reserveOut = bound(reserveOut, amountOut + 1, 1e24);
        uint256 amountIn = router.getAmountIn(amountOut, reserveIn, reserveOut);
        // Si on swap exactement amountIn, on doit obtenir >= amountOut
        uint256 actualOut = router.getAmountOut(amountIn, reserveIn, reserveOut);
        assertGe(actualOut, amountOut, "I3: getAmountIn under-estimates");
    }
}
