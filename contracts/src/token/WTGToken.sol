// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit, Nonces} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  WTGToken (Wrapped WTG = WWTG)
 * @author WINTG Team
 * @notice Wrapper ERC-20 du WTG natif (modèle WETH9 + EIP-2612 permit).
 *
 *         Pourquoi un wrapper ?
 *         - Le WTG est la pièce native de la chaîne (gas + transferts).
 *         - Les DEX, lending protocols, routing engines opèrent sur ERC-20.
 *         - WWTG permet d'utiliser le WTG dans tous ces contextes sans
 *           sacrifier les avantages du natif (gas, simplicité).
 *
 *         Mécanique :
 *         - `deposit()` : envoyer du WTG natif → mint la même quantité de WWTG
 *         - `withdraw(amount)` : burn WWTG → recevoir le natif
 *         - Ratio 1:1 garanti par construction (la totalSupply WWTG = balance
 *           native du contrat).
 *
 *         L'EIP-2612 permit permet aux dApps d'éviter les approvals manuels
 *         (UX gasless ou one-tx interaction).
 */
contract WTGToken is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using Address for address payable;

    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    error AmountIsZero();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    constructor() ERC20("Wrapped WINTG", "WWTG") ERC20Permit("Wrapped WINTG") {}

    /// @notice Recevoir du WTG natif déclenche un dépôt automatique.
    receive() external payable {
        _depositFor(msg.sender, msg.value);
    }

    /// @notice Dépose du WTG natif et mint le même montant de WWTG.
    function deposit() external payable {
        _depositFor(msg.sender, msg.value);
    }

    /// @notice Dépose du WTG natif et mint au profit d'un tiers.
    function depositTo(address to) external payable {
        _depositFor(to, msg.value);
    }

    function _depositFor(address to, uint256 amount) internal {
        if (amount == 0) revert AmountIsZero();
        _mint(to, amount);
        emit Deposit(to, amount);
    }

    /// @notice Burn `amount` WWTG et renvoie le WTG natif équivalent.
    function withdraw(uint256 amount) external nonReentrant {
        _withdrawTo(msg.sender, amount);
    }

    /// @notice Burn `amount` WWTG depuis msg.sender et envoie le natif à `to`.
    function withdrawTo(address payable to, uint256 amount) external nonReentrant {
        _withdrawTo(to, amount);
    }

    function _withdrawTo(address to, uint256 amount) internal {
        if (amount == 0) revert AmountIsZero();
        uint256 bal = balanceOf(msg.sender);
        if (amount > bal) revert InsufficientBalance(amount, bal);

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);

        payable(to).sendValue(amount);
    }

    // -------------------------------------------------------------------------
    // Solidity multiple-inheritance overrides (ERC20Votes + ERC20Permit/Nonces)
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
