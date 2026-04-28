// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  TimelockEscrow
 * @author WINTG Team
 * @notice Permet à un sender de "déposer" un transfert avec une fenêtre
 *         d'annulation de N secondes (max 7 jours). Anti-phishing.
 *         Le destinataire peut accepter plus tôt → consensus = skip timelock.
 *
 *         Compatible WTG natif et n'importe quel ERC-20.
 *         Gratuit (gas only).
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, ReentrancyGuard, NatSpec.
 */
contract TimelockEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 public constant MAX_LOCKWINDOW = 7 days;

    struct Transfer {
        address sender;
        address recipient;
        address token;        // NATIVE ou ERC-20
        uint256 amount;
        uint64  unlockAt;     // timestamp où le destinataire peut claim sans signature
        bool    accepted;     // marqué true quand le recipient skip le timelock
        bool    settled;      // claimed ou cancelled
    }

    mapping(uint256 => Transfer) public transfers;
    uint256 public nextTransferId;

    event TransferCreated(uint256 indexed id, address indexed sender, address indexed recipient, address token, uint256 amount, uint64 unlockAt);
    event TransferAcceptedEarly(uint256 indexed id, address indexed recipient);
    event TransferClaimed(uint256 indexed id, address indexed recipient, uint256 amount);
    event TransferCanceled(uint256 indexed id, address indexed sender);

    error InvalidLockWindow();
    error InvalidParams();
    error WrongPayment();
    error NotRecipient();
    error NotSender();
    error AlreadySettled();
    error NotYetUnlocked(uint64 unlockAt);
    error NotFound();
    error TransferFailed();

    /**
     * @notice Crée un transfert avec timelock. Pour ERC-20, le sender doit
     *         avoir approve. Pour le natif, msg.value doit == amount.
     */
    function send(address recipient, address token, uint256 amount, uint64 lockSeconds)
        external payable nonReentrant returns (uint256 id)
    {
        if (recipient == address(0) || amount == 0) revert InvalidParams();
        if (lockSeconds == 0 || lockSeconds > MAX_LOCKWINDOW) revert InvalidLockWindow();

        if (token == NATIVE) {
            if (msg.value != amount) revert WrongPayment();
        } else {
            if (msg.value != 0) revert WrongPayment();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        id = nextTransferId++;
        transfers[id] = Transfer({
            sender:    msg.sender,
            recipient: recipient,
            token:     token,
            amount:    amount,
            unlockAt:  uint64(block.timestamp + lockSeconds),
            accepted:  false,
            settled:   false
        });
        emit TransferCreated(id, msg.sender, recipient, token, amount, uint64(block.timestamp + lockSeconds));
    }

    /**
     * @notice Le destinataire peut accepter plus tôt (skip timelock).
     */
    function acceptEarly(uint256 id) external nonReentrant {
        Transfer storage t = transfers[id];
        if (t.sender == address(0)) revert NotFound();
        if (t.settled) revert AlreadySettled();
        if (msg.sender != t.recipient) revert NotRecipient();
        t.accepted = true;
        t.settled = true;
        _payOut(t.token, payable(t.recipient), t.amount);
        emit TransferAcceptedEarly(id, t.recipient);
        emit TransferClaimed(id, t.recipient, t.amount);
    }

    /**
     * @notice Une fois unlockAt passé, le destinataire claim ses fonds.
     */
    function claim(uint256 id) external nonReentrant {
        Transfer storage t = transfers[id];
        if (t.sender == address(0)) revert NotFound();
        if (t.settled) revert AlreadySettled();
        if (msg.sender != t.recipient) revert NotRecipient();
        if (block.timestamp < t.unlockAt) revert NotYetUnlocked(t.unlockAt);
        t.settled = true;
        _payOut(t.token, payable(t.recipient), t.amount);
        emit TransferClaimed(id, t.recipient, t.amount);
    }

    /**
     * @notice Le sender annule son transfert avant l'expiration et avant
     *         que le destinataire l'accepte.
     */
    function cancel(uint256 id) external nonReentrant {
        Transfer storage t = transfers[id];
        if (t.sender == address(0)) revert NotFound();
        if (t.settled) revert AlreadySettled();
        if (msg.sender != t.sender) revert NotSender();
        if (t.accepted) revert AlreadySettled();
        if (block.timestamp >= t.unlockAt) revert AlreadySettled();
        t.settled = true;
        _payOut(t.token, payable(t.sender), t.amount);
        emit TransferCanceled(id, t.sender);
    }

    function _payOut(address token, address payable to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
