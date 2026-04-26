// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  WINTGTreasury
 * @author WINTG Team
 * @notice Multisig M-of-N gérant la trésorerie WINTG. Reçoit notamment les
 *         70 % des frais de transaction (via `FeeDistributor`) et les
 *         libérations du `TreasuryVesting`.
 *
 *         Fonctionnalités :
 *           - Soumission de transactions par n'importe quel signataire
 *           - Confirmation par les autres signataires
 *           - Exécution dès que le seuil M est atteint
 *           - **Timelock optionnel** par transaction (0 = pas de délai)
 *           - Rotation des signataires via une transaction "auto-référente"
 *
 * @dev    Ce contrat est volontairement minimaliste pour la phase 1. Pour
 *         la phase 2, on basculera sur Gnosis Safe (audit, écosystème).
 */
contract WINTGTreasury is ReentrancyGuard {
    using Address for address payable;
    using Address for address;

    // -------------------------------------------------------------------------
    // Storage — signers
    // -------------------------------------------------------------------------

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public threshold;

    // -------------------------------------------------------------------------
    // Storage — transactions
    // -------------------------------------------------------------------------

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        uint64  notBefore;     // 0 = pas de timelock
        bool    executed;
        uint128 confirmations;
    }

    Transaction[] public transactions;
    /// @dev txId => signer => confirmed
    mapping(uint256 => mapping(address => bool)) public confirmed;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Submitted(uint256 indexed txId, address indexed signer, address to, uint256 value, bytes data, uint64 notBefore);
    event Confirmed(uint256 indexed txId, address indexed signer, uint128 confirmations);
    event Revoked(uint256 indexed txId, address indexed signer, uint128 confirmations);
    event Executed(uint256 indexed txId, bool success, bytes returnData);
    event SignersUpdated(address[] newSigners, uint256 newThreshold);
    event Deposited(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotSigner();
    error ZeroAddress();
    error InvalidThreshold(uint256 threshold, uint256 nSigners);
    error DuplicateSigner(address signer);
    error TxNotFound(uint256 txId);
    error AlreadyExecuted(uint256 txId);
    error AlreadyConfirmed(uint256 txId, address signer);
    error NotConfirmed(uint256 txId, address signer);
    error InsufficientConfirmations(uint128 have, uint256 need);
    error TimelockActive(uint64 notBefore, uint64 nowTs);
    error CallReverted(bytes returnData);
    error OnlySelf();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    modifier txExists(uint256 txId) {
        if (txId >= transactions.length) revert TxNotFound(txId);
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address[] memory signers_, uint256 threshold_) {
        _setSigners(signers_, threshold_);
    }

    // -------------------------------------------------------------------------
    // Receive funds
    // -------------------------------------------------------------------------

    receive() external payable {
        if (msg.value > 0) emit Deposited(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Submit / confirm / revoke / execute
    // -------------------------------------------------------------------------

    function submit(address to, uint256 value, bytes calldata data, uint64 notBefore)
        external
        onlySigner
        returns (uint256 txId)
    {
        if (to == address(0)) revert ZeroAddress();
        txId = transactions.length;
        transactions.push(Transaction({
            to: to,
            value: value,
            data: data,
            notBefore: notBefore,
            executed: false,
            confirmations: 0
        }));
        emit Submitted(txId, msg.sender, to, value, data, notBefore);

        // Auto-confirme
        _confirm(txId);
    }

    function confirm(uint256 txId) external onlySigner txExists(txId) {
        _confirm(txId);
    }

    function _confirm(uint256 txId) internal {
        Transaction storage t = transactions[txId];
        if (t.executed) revert AlreadyExecuted(txId);
        if (confirmed[txId][msg.sender]) revert AlreadyConfirmed(txId, msg.sender);

        confirmed[txId][msg.sender] = true;
        unchecked { t.confirmations += 1; }
        emit Confirmed(txId, msg.sender, t.confirmations);
    }

    function revokeConfirmation(uint256 txId) external onlySigner txExists(txId) {
        Transaction storage t = transactions[txId];
        if (t.executed) revert AlreadyExecuted(txId);
        if (!confirmed[txId][msg.sender]) revert NotConfirmed(txId, msg.sender);

        confirmed[txId][msg.sender] = false;
        unchecked { t.confirmations -= 1; }
        emit Revoked(txId, msg.sender, t.confirmations);
    }

    function execute(uint256 txId) external onlySigner txExists(txId) nonReentrant {
        Transaction storage t = transactions[txId];
        if (t.executed) revert AlreadyExecuted(txId);
        if (t.confirmations < threshold) revert InsufficientConfirmations(t.confirmations, threshold);
        if (t.notBefore != 0 && uint64(block.timestamp) < t.notBefore) {
            revert TimelockActive(t.notBefore, uint64(block.timestamp));
        }

        t.executed = true;
        (bool ok, bytes memory ret) = t.to.call{value: t.value}(t.data);
        emit Executed(txId, ok, ret);
        if (!ok) revert CallReverted(ret);
    }

    // -------------------------------------------------------------------------
    // Signer rotation — only via self-call (= validated multisig transaction)
    // -------------------------------------------------------------------------

    /**
     * @notice Met à jour les signataires et le seuil. Ne peut être appelé que
     *         par le contrat lui-même (via une transaction multisig validée).
     *         Pour rotater, soumettre via `submit(this, 0, abi.encodeCall(...))`.
     */
    function updateSigners(address[] calldata newSigners, uint256 newThreshold)
        external
        onlySelf
    {
        _setSigners(newSigners, newThreshold);
    }

    function _setSigners(address[] memory newSigners, uint256 newThreshold) internal {
        if (newThreshold == 0 || newThreshold > newSigners.length) {
            revert InvalidThreshold(newThreshold, newSigners.length);
        }

        // Vider l'ancien set
        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = false;
        }
        delete signers;

        for (uint256 i = 0; i < newSigners.length; i++) {
            address s = newSigners[i];
            if (s == address(0)) revert ZeroAddress();
            if (isSigner[s]) revert DuplicateSigner(s);
            isSigner[s] = true;
            signers.push(s);
        }
        threshold = newThreshold;

        emit SignersUpdated(newSigners, newThreshold);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function signersCount() external view returns (uint256) {
        return signers.length;
    }

    function transactionsCount() external view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 txId)
        external
        view
        txExists(txId)
        returns (
            address to,
            uint256 value,
            bytes memory data,
            uint64 notBefore,
            bool executed,
            uint128 confirmations
        )
    {
        Transaction storage t = transactions[txId];
        return (t.to, t.value, t.data, t.notBefore, t.executed, t.confirmations);
    }
}
