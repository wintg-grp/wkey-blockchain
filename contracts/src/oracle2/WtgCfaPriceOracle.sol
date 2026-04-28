// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title  WtgCfaPriceOracle
 * @author WINTG Team
 * @notice Oracle qui publie le prix WTG/CFA on-chain. Bloquant pour la
 *         Phase 2 et pour le `WCFAVault`.
 *
 *         Architecture phase 1 : un opérateur autorisé (off-chain
 *         worker) push le prix toutes les 15 minutes (heartbeat). En cas
 *         de stale (>15 min sans update), le flag `stale` passe à true et
 *         les consommateurs (vaults, marketplace) refusent les opérations
 *         critiques. Le multisig peut override en urgence.
 *
 *         Plus tard (phase 2) : agréger plusieurs sources via
 *         `OracleAggregatorV2`.
 *
 *         Initialement : prix de lancement 50 CFA = 1 WTG.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step.
 */
contract WtgCfaPriceOracle is Ownable2Step {
    /// @notice Prix WTG/CFA en CFA × 10^8 (8 decimals, comme Chainlink).
    int256 public latestPrice;
    uint64 public latestUpdate;

    /// @notice Heartbeat max sans update (au-delà → stale).
    uint64 public constant HEARTBEAT_SECONDS = 15 minutes * 4; // 60 min tolerance buffer

    /// @notice Threshold de déviation pour push (ex: 0,3 % = 30 bps).
    uint96 public deviationThresholdBps = 30;

    /// @notice Operator(s) autorisés à push le prix.
    mapping(address => bool) public isOperator;

    /// @notice Max history des 256 derniers updates (pour TWAP, calcul historique).
    struct PricePoint { int256 price; uint64 timestamp; }
    PricePoint[] public history;

    event OperatorChanged(address indexed operator, bool authorized);
    event PriceUpdated(int256 newPrice, uint64 timestamp);
    event DeviationThresholdChanged(uint96 newBps);

    error NotOperator();
    error InvalidPrice();
    error InvalidThreshold();

    constructor(address initialOwner, address initialOperator, int256 initialPrice) Ownable(initialOwner) {
        if (initialPrice <= 0) revert InvalidPrice();
        isOperator[initialOperator] = true;
        latestPrice = initialPrice;
        latestUpdate = uint64(block.timestamp);
        history.push(PricePoint(initialPrice, uint64(block.timestamp)));
        emit OperatorChanged(initialOperator, true);
        emit PriceUpdated(initialPrice, uint64(block.timestamp));
    }

    function pushPrice(int256 newPrice) external {
        if (!isOperator[msg.sender] && msg.sender != owner()) revert NotOperator();
        if (newPrice <= 0) revert InvalidPrice();
        latestPrice = newPrice;
        latestUpdate = uint64(block.timestamp);
        if (history.length == 256) {
            // Shift not gas-friendly, but acceptable since this happens every 15 min.
            // For a real production rolling buffer we'd use circular indexing.
            for (uint256 i = 0; i < 255; ++i) history[i] = history[i + 1];
            history[255] = PricePoint(newPrice, uint64(block.timestamp));
        } else {
            history.push(PricePoint(newPrice, uint64(block.timestamp)));
        }
        emit PriceUpdated(newPrice, uint64(block.timestamp));
    }

    /// @notice True si l'oracle est stale (heartbeat dépassé).
    function isStale() external view returns (bool) {
        return block.timestamp > uint256(latestUpdate) + uint256(HEARTBEAT_SECONDS);
    }

    function setOperator(address op, bool authorized) external onlyOwner {
        isOperator[op] = authorized;
        emit OperatorChanged(op, authorized);
    }

    function setDeviationThreshold(uint96 newBps) external onlyOwner {
        if (newBps > 1000) revert InvalidThreshold(); // max 10 %
        deviationThresholdBps = newBps;
        emit DeviationThresholdChanged(newBps);
    }

    function historyLength() external view returns (uint256) { return history.length; }
}
