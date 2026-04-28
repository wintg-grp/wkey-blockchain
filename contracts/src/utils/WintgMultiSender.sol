// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  WintgMultiSender
 * @author WINTG Team
 * @notice Utility public WINTG : envoie en 1 transaction du WTG natif, des
 *         tokens ERC-20, des NFT ERC-721 ou des items ERC-1155 à plusieurs
 *         destinataires (jusqu'à 500). Énorme gain de gas vs N tx
 *         individuelles.
 *
 *         **Gratuit** (gas only) — c'est un service public WINTG.
 *
 *         Pour les ERC-20, l'utilisateur doit avoir au préalable approve
 *         ce contrat sur le token (ou utiliser permit puis multisendERC20).
 *         Pour les NFT, idem (setApprovalForAll).
 *
 *         Sécurité contre les destinataires malicieux (WTG natif) :
 *         chaque transfert utilise un budget de 30 000 gas. Si un
 *         destinataire échoue, on émet un event `Failed` et on continue
 *         le batch. Le solde non distribué est renvoyé au sender en fin
 *         de tx.
 *
 * @dev    Pas de fee, pas d'admin, pas de pause — utility minimaliste.
 *         Conformes WINTG : Apache-2.0, OZ v5, NatSpec.
 */
contract WintgMultiSender {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MAX_RECIPIENTS = 500;

    /// @notice Gas alloué à chaque transfert WTG natif.
    uint256 public constant NATIVE_TRANSFER_GAS = 30_000;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BulkSentNative(address indexed sender, uint256 totalSent, uint256 recipientCount, uint256 failedCount);

    event BulkSentERC20(address indexed sender, address indexed token, uint256 totalSent, uint256 recipientCount);

    event BulkSentERC721(address indexed sender, address indexed collection, uint256 recipientCount);

    event BulkSentERC1155(address indexed sender, address indexed collection, uint256 recipientCount);

    event NativeTransferFailed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error LengthMismatch();
    error TooManyRecipients(uint256 count);
    error InsufficientNative(uint256 expected, uint256 received);
    error RefundFailed();

    // -------------------------------------------------------------------------
    // Native (WTG) — payable
    // -------------------------------------------------------------------------

    /**
     * @notice Envoie du WTG natif à N destinataires avec montants individuels.
     *         Le sender doit envoyer >= sum(amounts). Excédent refundé.
     */
    function multisendNative(address[] calldata recipients, uint256[] calldata amounts) external payable returns (uint256 totalSent, uint256 failedCount) {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);

        uint256 total;
        for (uint256 i; i < amounts.length; ++i) total += amounts[i];
        if (msg.value < total) revert InsufficientNative(total, msg.value);

        for (uint256 i; i < recipients.length; ++i) {
            (bool ok, ) = payable(recipients[i]).call{value: amounts[i], gas: NATIVE_TRANSFER_GAS}("");
            if (ok) {
                totalSent += amounts[i];
            } else {
                failedCount++;
                emit NativeTransferFailed(recipients[i], amounts[i]);
            }
        }

        // Refund the difference (failed amounts + any excess).
        uint256 refund = msg.value - totalSent;
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit BulkSentNative(msg.sender, totalSent, recipients.length, failedCount);
    }

    /**
     * @notice Envoie le même montant de WTG natif à N destinataires.
     */
    function multisendNativeEqual(address[] calldata recipients, uint256 amount) external payable returns (uint256 totalSent, uint256 failedCount) {
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);
        uint256 total = amount * recipients.length;
        if (msg.value < total) revert InsufficientNative(total, msg.value);

        for (uint256 i; i < recipients.length; ++i) {
            (bool ok, ) = payable(recipients[i]).call{value: amount, gas: NATIVE_TRANSFER_GAS}("");
            if (ok) {
                totalSent += amount;
            } else {
                failedCount++;
                emit NativeTransferFailed(recipients[i], amount);
            }
        }

        uint256 refund = msg.value - totalSent;
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit BulkSentNative(msg.sender, totalSent, recipients.length, failedCount);
    }

    // -------------------------------------------------------------------------
    // ERC-20
    // -------------------------------------------------------------------------

    /**
     * @notice Envoie un ERC-20 à N destinataires (montants individuels).
     *         Le sender doit avoir approve ce contrat au préalable.
     */
    function multisendERC20(IERC20 token, address[] calldata recipients, uint256[] calldata amounts) external returns (uint256 totalSent) {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);

        for (uint256 i; i < recipients.length; ++i) {
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            totalSent += amounts[i];
        }

        emit BulkSentERC20(msg.sender, address(token), totalSent, recipients.length);
    }

    /**
     * @notice Envoie un ERC-20 (même montant) à N destinataires.
     */
    function multisendERC20Equal(IERC20 token, address[] calldata recipients, uint256 amount) external returns (uint256 totalSent) {
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);

        for (uint256 i; i < recipients.length; ++i) {
            token.safeTransferFrom(msg.sender, recipients[i], amount);
        }
        totalSent = amount * recipients.length;

        emit BulkSentERC20(msg.sender, address(token), totalSent, recipients.length);
    }

    // -------------------------------------------------------------------------
    // ERC-721
    // -------------------------------------------------------------------------

    /**
     * @notice Envoie N items ERC-721 à N destinataires (1 token par
     *         destinataire). Le sender doit avoir approve ou
     *         setApprovalForAll au préalable.
     */
    function multisendERC721(IERC721 collection, address[] calldata recipients, uint256[] calldata tokenIds) external {
        if (recipients.length != tokenIds.length) revert LengthMismatch();
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);

        for (uint256 i; i < recipients.length; ++i) {
            collection.safeTransferFrom(msg.sender, recipients[i], tokenIds[i]);
        }

        emit BulkSentERC721(msg.sender, address(collection), recipients.length);
    }

    // -------------------------------------------------------------------------
    // ERC-1155
    // -------------------------------------------------------------------------

    /**
     * @notice Envoie un même `id` ERC-1155 à N destinataires avec quantités
     *         individuelles. Le sender doit avoir setApprovalForAll au
     *         préalable.
     */
    function multisendERC1155(IERC1155 collection, address[] calldata recipients, uint256 id, uint256[] calldata amounts) external {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length == 0 || recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length);

        for (uint256 i; i < recipients.length; ++i) {
            collection.safeTransferFrom(msg.sender, recipients[i], id, amounts[i], "");
        }

        emit BulkSentERC1155(msg.sender, address(collection), recipients.length);
    }
}
