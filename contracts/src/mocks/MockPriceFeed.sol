// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/**
 * @title  MockPriceFeed
 * @author WINTG Team
 * @notice Test-only price feed compatible with the Chainlink AggregatorV3
 *         shape. Used by the test suite to drive deterministic prices into
 *         contracts that consume `latestRoundData`.
 *
 *         Not for production use.
 */
contract MockPriceFeed {
    uint8  public immutable decimalsValue;
    int256 public price;
    uint256 public updatedAt;

    constructor(uint8 decimals_, int256 initialPrice) {
        decimalsValue = decimals_;
        price = initialPrice;
        updatedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) { return decimalsValue; }

    function setPrice(int256 newPrice) external {
        price = newPrice;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 ts) external {
        updatedAt = ts;
    }

    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 ts, uint80 answeredInRound)
    {
        return (1, price, updatedAt, updatedAt, 1);
    }

    function getRoundData(uint80)
        external view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, updatedAt, updatedAt, 1);
    }
}
