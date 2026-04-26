// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @notice Interface AggregatorV3 compatible Chainlink (sous-ensemble courant).
 *         Tout dApp DeFi utilisant Chainlink peut consommer ce contrat sans
 *         modification (`AggregatorV3Interface`).
 */
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function getRoundData(uint80 roundId)
        external view
        returns (uint80, int256, uint256, uint256, uint80);
}

/**
 * @title  OracleAggregator
 * @author WINTG Team
 * @notice Agrégateur d'oracles avec push-model par opérateurs autorisés.
 *         Plusieurs opérateurs poussent leur prix, le contrat retourne la
 *         **médiane** des derniers prix valides comme valeur canonique.
 *
 *         Compatible `AggregatorV3Interface` de Chainlink → utilisable
 *         tel quel par les dApps DeFi (lending, stablecoins, etc.).
 *
 *         Sécurité :
 *           - `MAX_PRICE_AGE` : un prix > X minutes est ignoré
 *           - `MAX_DEVIATION_BPS` : un push qui dévie > X bps de la médiane
 *             courante est rejeté (anti manipulation single-operator)
 *           - Minimum 3 opérateurs pour calculer une médiane robuste
 */
contract OracleAggregator is Ownable2Step, AggregatorV3Interface {
    uint8 public immutable decimalsValue;
    string public descriptionValue;
    uint256 public constant version = 1;

    /// @notice Âge maximum d'un prix pour qu'il soit considéré valide.
    uint64 public maxPriceAge;
    /// @notice Déviation maximale par rapport à la médiane (basis points).
    uint16 public maxDeviationBps;

    struct PricePoint { int256 price; uint64 timestamp; }
    mapping(address => PricePoint) public operatorPrices;
    address[] public operators;
    mapping(address => bool) public isOperator;

    uint80 public latestRoundId;
    int256 public latestPrice;
    uint64 public latestTimestamp;

    event PriceUpdated(address indexed operator, int256 price, uint64 timestamp);
    event RoundClosed(uint80 indexed roundId, int256 medianPrice, uint64 timestamp);
    event OperatorsUpdated(address[] operators);

    error NotOperator();
    error InvalidPrice();
    error PriceTooOld(uint64 priceTs, uint64 maxAge);
    error TooFewValidPrices(uint256 valid, uint256 needed);
    error DeviationTooHigh(int256 newPrice, int256 median, uint16 deviationBps);

    constructor(
        address initialOwner_,
        uint8 decimals_,
        string memory description_,
        uint64 maxPriceAge_,
        uint16 maxDeviationBps_
    ) Ownable(initialOwner_) {
        decimalsValue = decimals_;
        descriptionValue = description_;
        maxPriceAge = maxPriceAge_;
        maxDeviationBps = maxDeviationBps_;
    }

    function decimals() external view returns (uint8) { return decimalsValue; }
    function description() external view returns (string memory) { return descriptionValue; }

    function setOperators(address[] calldata newOps) external onlyOwner {
        for (uint256 i = 0; i < operators.length; i++) {
            isOperator[operators[i]] = false;
        }
        delete operators;
        for (uint256 i = 0; i < newOps.length; i++) {
            isOperator[newOps[i]] = true;
            operators.push(newOps[i]);
        }
        emit OperatorsUpdated(newOps);
    }

    function setMaxPriceAge(uint64 v) external onlyOwner { maxPriceAge = v; }
    function setMaxDeviationBps(uint16 v) external onlyOwner { maxDeviationBps = v; }

    /// @notice Un opérateur pousse son prix observé.
    function submitPrice(int256 price) external {
        if (!isOperator[msg.sender]) revert NotOperator();
        if (price <= 0) revert InvalidPrice();

        // Anti manipulation : si on a déjà une médiane, vérifier la déviation.
        if (latestPrice > 0) {
            int256 diff = price > latestPrice ? price - latestPrice : latestPrice - price;
            uint256 devBps = (uint256(diff) * 10_000) / uint256(latestPrice);
            if (devBps > maxDeviationBps) {
                revert DeviationTooHigh(price, latestPrice, uint16(devBps));
            }
        }

        operatorPrices[msg.sender] = PricePoint(price, uint64(block.timestamp));
        emit PriceUpdated(msg.sender, price, uint64(block.timestamp));

        // Recalcule la médiane et clôt un round si on a quorum
        _recomputeMedian();
    }

    function _recomputeMedian() internal {
        uint64 nowTs = uint64(block.timestamp);
        uint256 n = operators.length;
        int256[] memory valid = new int256[](n);
        uint256 vCount = 0;
        for (uint256 i = 0; i < n; i++) {
            PricePoint memory p = operatorPrices[operators[i]];
            if (p.price > 0 && nowTs - p.timestamp <= maxPriceAge) {
                valid[vCount++] = p.price;
            }
        }
        if (vCount < 3) return; // pas encore quorum, pas de mise à jour

        // Bubble sort (n petit, 5-7 max)
        for (uint256 i = 0; i < vCount; i++) {
            for (uint256 j = 0; j + 1 < vCount - i; j++) {
                if (valid[j] > valid[j + 1]) {
                    (valid[j], valid[j + 1]) = (valid[j + 1], valid[j]);
                }
            }
        }
        int256 median = vCount % 2 == 1
            ? valid[vCount / 2]
            : (valid[vCount / 2 - 1] + valid[vCount / 2]) / 2;

        unchecked { latestRoundId += 1; }
        latestPrice = median;
        latestTimestamp = nowTs;

        emit RoundClosed(latestRoundId, median, nowTs);
    }

    // -------------------------------------------------------------------------
    // AggregatorV3Interface
    // -------------------------------------------------------------------------

    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        if (latestPrice == 0) revert TooFewValidPrices(0, 3);
        if (uint64(block.timestamp) - latestTimestamp > maxPriceAge) {
            revert PriceTooOld(latestTimestamp, maxPriceAge);
        }
        return (latestRoundId, latestPrice, latestTimestamp, latestTimestamp, latestRoundId);
    }

    function getRoundData(uint80 /* roundId */)
        external view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        // Historique non conservé pour économiser le storage. Implémenter
        // un ring buffer si besoin pour les dApps qui veulent l'historique.
        return (latestRoundId, latestPrice, latestTimestamp, latestTimestamp, latestRoundId);
    }

    function operatorsCount() external view returns (uint256) { return operators.length; }
}
