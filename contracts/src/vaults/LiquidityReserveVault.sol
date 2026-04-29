// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  LiquidityReserveVault
 * @author WINTG Team
 * @notice Coffre qui accumule les WTG / WKEY / autres tokens reçus en
 *         paiement (subscriptions, services, frais), pour servir plus
 *         tard de liquidité initiale au DEX.
 *
 *         Modèle "Pre-DEX bootstrap" :
 *           1. Subscriptions / services WINTG → tokens versés ici
 *           2. Quand le multisig estime qu'on a accumulé assez
 *              → `releaseToLiquidity()` envoie les tokens à une pool DEX
 *           3. À ce moment-là, le marché peut commencer à découvrir
 *              le prix sur le DEX
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract LiquidityReserveVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice mapping token => total reçu jamais (cumulatif)
    mapping(address => uint256) public lifetimeReceived;

    /// @notice mapping token => total libéré vers DEX (cumulatif)
    mapping(address => uint256) public lifetimeReleased;

    event Deposited(address indexed from, address indexed token, uint256 amount);
    event ReleasedToLiquidity(address indexed token, address indexed pool, uint256 amount);
    event WithdrawnEmergency(address indexed token, address indexed to, uint256 amount, string reason);

    error InvalidParams();
    error InsufficientBalance(uint256 want, uint256 have);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice N'importe qui peut déposer des tokens dans la réserve
     *         (en pratique, seuls les contrats `SubscriptionPayment`,
     *         le treasury et les services WINTG le font).
     */
    function deposit(IERC20 token, uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidParams();
        token.safeTransferFrom(msg.sender, address(this), amount);
        lifetimeReceived[address(token)] += amount;
        emit Deposited(msg.sender, address(token), amount);
    }

    /**
     * @notice Le multisig libère des tokens vers une pool DEX
     *         (typiquement quand on lance la pool initiale).
     */
    function releaseToLiquidity(IERC20 token, address pool, uint256 amount) external onlyOwner nonReentrant {
        if (pool == address(0) || amount == 0) revert InvalidParams();
        uint256 bal = token.balanceOf(address(this));
        if (amount > bal) revert InsufficientBalance(amount, bal);
        token.safeTransfer(pool, amount);
        lifetimeReleased[address(token)] += amount;
        emit ReleasedToLiquidity(address(token), pool, amount);
    }

    /**
     * @notice Retrait d'urgence — uniquement pour incidents documentés
     *         (token bloqué par erreur, etc.). Reason loggé on-chain.
     */
    function emergencyWithdraw(IERC20 token, address to, uint256 amount, string calldata reason)
        external onlyOwner nonReentrant
    {
        if (to == address(0) || amount == 0) revert InvalidParams();
        token.safeTransfer(to, amount);
        emit WithdrawnEmergency(address(token), to, amount, reason);
    }

    function balanceOf(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
