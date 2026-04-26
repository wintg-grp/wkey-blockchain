// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {WINTGPair} from "./WINTGPair.sol";

/**
 * @title  WINTGFactory
 * @author WINTG Team
 * @notice Factory du DEX WINTG. Crée des paires (`WINTGPair`) pour tout
 *         couple de tokens ERC-20. Compatible Uniswap V2 (les routers
 *         externes peuvent être pointés ici).
 */
contract WINTGFactory is Ownable2Step {
    /// @notice Destinataire du fee protocole (1/6 des fees de swap).
    ///         `address(0)` = pas de fee protocole, 100 % LP.
    address public feeTo;

    /// @notice Adresse autorisée à modifier `feeTo` (séparée pour gouvernance).
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 length);
    event FeeToUpdated(address indexed oldFeeTo, address indexed newFeeTo);
    event FeeToSetterUpdated(address indexed oldSetter, address indexed newSetter);

    error IdenticalAddresses();
    error ZeroAddress();
    error PairExists();
    error Forbidden();

    constructor(address initialOwner_, address feeToSetter_) Ownable(initialOwner_) {
        if (feeToSetter_ == address(0)) revert ZeroAddress();
        feeToSetter = feeToSetter_;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Crée une nouvelle pair pour `tokenA`/`tokenB` (ordre indifférent).
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new WINTGPair{salt: salt}());
        WINTGPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        if (msg.sender != feeToSetter) revert Forbidden();
        emit FeeToUpdated(feeTo, _feeTo);
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        if (msg.sender != feeToSetter) revert Forbidden();
        if (_feeToSetter == address(0)) revert ZeroAddress();
        emit FeeToSetterUpdated(feeToSetter, _feeToSetter);
        feeToSetter = _feeToSetter;
    }
}
