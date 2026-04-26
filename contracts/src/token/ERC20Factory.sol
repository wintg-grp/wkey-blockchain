// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {SimpleERC20} from "./SimpleERC20.sol";

/**
 * @title  ERC20Factory
 * @author WINTG Team
 * @notice Crée des tokens ERC-20 (template `SimpleERC20`) contre un frais
 *         fixe en WTG versé à la Trésorerie.
 *
 *         **Frais par défaut au lancement : 100 WTG par création**
 *         (modifiable par DAO Timelock, capé à 10 000 WTG).
 */
contract ERC20Factory is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    uint256 public constant MAX_FEE = 10_000 ether;

    address payable public treasury;
    uint256 public fee;

    address[] public allTokens;
    mapping(address => address[]) public tokensByCreator;

    event TokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint256 feePaid
    );
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed treasury);

    error InsufficientFee(uint256 required, uint256 sent);
    error FeeTooHigh(uint256 requested, uint256 max);
    error ZeroAddress();
    error EmptyName();

    constructor(address initialOwner_, address payable treasury_, uint256 initialFee)
        Ownable(initialOwner_)
    {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (initialFee > MAX_FEE) revert FeeTooHigh(initialFee, MAX_FEE);
        treasury = treasury_;
        fee = initialFee;
    }

    function createERC20(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply,
        bool mintable
    ) external payable nonReentrant whenNotPaused returns (address token) {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        if (bytes(name).length == 0) revert EmptyName();

        SimpleERC20 t = new SimpleERC20(name, symbol, decimals, initialSupply, msg.sender, mintable);
        token = address(t);

        allTokens.push(token);
        tokensByCreator[msg.sender].push(token);
        emit TokenCreated(msg.sender, token, name, symbol, fee);

        if (fee > 0) treasury.sendValue(fee);
        if (msg.value > fee) {
            payable(msg.sender).sendValue(msg.value - fee);
        }
    }

    function setFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeTooHigh(newFee, MAX_FEE);
        emit FeeUpdated(fee, newFee);
        fee = newFee;
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function totalTokensCreated() external view returns (uint256) {
        return allTokens.length;
    }

    function tokensByCreatorCount(address creator) external view returns (uint256) {
        return tokensByCreator[creator].length;
    }

    function listTokens(uint256 offset, uint256 limit)
        external view returns (address[] memory page)
    {
        uint256 total = allTokens.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) page[i] = allTokens[offset + i];
    }
}
