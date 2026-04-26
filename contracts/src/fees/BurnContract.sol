// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  BurnContract
 * @author WINTG Team
 * @notice Contrat de burn déflationniste. Reçoit la part 10 % des frais
 *         (via `FeeDistributor`) et les envoie de manière irréversible à
 *         l'adresse `BURN_ADDRESS = 0x000…dEaD`.
 *
 * @dev    Pourquoi pas brûler nativement (envoyer à l'adresse zéro) ?
 *         L'adresse `0x000…dEaD` est largement reconnue comme "burn" dans
 *         l'écosystème EVM (block explorers la flagguent). L'adresse `0x0`
 *         pourrait être confondue avec un contrat non déployé.
 *
 *         Toute personne peut appeler `burnPending()` pour brûler le solde
 *         courant et ainsi mettre à jour le compteur public `totalBurned`.
 */
contract BurnContract {
    /// @notice Adresse "dead" canonique. Privée hors `block.coinbase`.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Cumul total brûlé (en wei).
    uint256 public totalBurned;

    event FundsReceived(address indexed from, uint256 amount);
    event Burned(address indexed triggeredBy, uint256 amount, uint256 totalBurned);

    error NothingToBurn();
    error TransferFailed();

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    /**
     * @notice Brûle l'intégralité du solde courant en l'envoyant à
     *         `BURN_ADDRESS`. Public et permissionless.
     */
    function burnPending() external {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToBurn();

        totalBurned += amount;
        emit Burned(msg.sender, amount, totalBurned);

        (bool ok, ) = BURN_ADDRESS.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Solde en attente de burn.
    function pendingBurn() external view returns (uint256) {
        return address(this).balance;
    }
}
