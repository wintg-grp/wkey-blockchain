// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA}          from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title  SocialRecoveryModule
 * @author WINTG Team
 * @notice Module générique de social recovery pour les wallets smart-contract
 *         (compatible ERC-4337). Permet à un user de récupérer son wallet
 *         si la clé est perdue, via un quorum de gardiens (M-of-N).
 *
 *         Configuration :
 *           - 2 minimum gardiens
 *           - défaut 3-of-5
 *           - timelock 48h après déclenchement (fenêtre d'annulation)
 *           - gardiens peuvent être des EOA ou contracts (multisig, autre wallet)
 *
 *         Workflow :
 *           1. user appelle `setupRecovery(guardians, threshold)` une fois
 *           2. en cas de perte : N gardiens signent une nouvelle ownerKey
 *           3. n'importe qui appelle `initiateRecovery(newOwner, signatures)`
 *           4. attente 48h (fenêtre d'annulation par le current owner)
 *           5. `executeRecovery()` → transfère ownership
 *
 * @dev    Ce module est conçu pour être attaché à un compte ERC-4337 ou
 *         tout wallet smart-contract qui expose une fonction
 *         `setOwnerByModule(address newOwner)` réservée à ce module.
 *
 *         Conforme WINTG : Apache-2.0, OZ v5, NatSpec.
 */
interface IRecoverableWallet {
    function setOwnerByModule(address newOwner) external;
    function owner() external view returns (address);
}

contract SocialRecoveryModule is ReentrancyGuard {
    uint256 public constant MIN_GUARDIANS    = 2;
    uint256 public constant TIMELOCK_SECONDS = 48 hours;

    struct Config {
        address[] guardians;
        uint256   threshold;
        bool      configured;
    }

    struct PendingRecovery {
        address newOwner;
        uint64  initiatedAt;
        bool    pending;
        bytes32 nonce; // anti-replay
    }

    /// @notice wallet => config
    mapping(address => Config) private _configs;

    /// @notice wallet => pending recovery
    mapping(address => PendingRecovery) public pending;

    /// @notice wallet => nonce sequencer (incremental)
    mapping(address => uint256) public recoveryNonce;

    /// @notice wallet => guardian => is guardian
    mapping(address => mapping(address => bool)) public isGuardian;

    event RecoveryConfigured(address indexed wallet, address[] guardians, uint256 threshold);
    event RecoveryInitiated(address indexed wallet, address indexed newOwner, uint64 executableAt);
    event RecoveryExecuted(address indexed wallet, address indexed newOwner);
    event RecoveryCanceled(address indexed wallet);
    event GuardiansUpdated(address indexed wallet, address[] guardians, uint256 threshold);

    error NotEnoughGuardians();
    error InvalidThreshold();
    error DuplicateGuardian();
    error ZeroAddress();
    error NotConfigured();
    error AlreadyPending();
    error NoPending();
    error NotReady(uint64 ready);
    error InvalidSignature();
    error InsufficientSignatures(uint256 have, uint256 need);
    error NotOwner();

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setupRecovery(address[] calldata guardians_, uint256 threshold_) external {
        _validateConfig(guardians_, threshold_);
        Config storage c = _configs[msg.sender];
        // Clear old guardians.
        if (c.configured) {
            for (uint256 i; i < c.guardians.length; ++i) {
                isGuardian[msg.sender][c.guardians[i]] = false;
            }
        }
        // Set new.
        delete c.guardians;
        for (uint256 i; i < guardians_.length; ++i) {
            address g = guardians_[i];
            if (g == address(0)) revert ZeroAddress();
            if (isGuardian[msg.sender][g]) revert DuplicateGuardian();
            isGuardian[msg.sender][g] = true;
            c.guardians.push(g);
        }
        c.threshold  = threshold_;
        c.configured = true;
        emit RecoveryConfigured(msg.sender, guardians_, threshold_);
    }

    function updateGuardians(address[] calldata guardians_, uint256 threshold_) external {
        Config storage c = _configs[msg.sender];
        if (!c.configured) revert NotConfigured();
        _validateConfig(guardians_, threshold_);
        for (uint256 i; i < c.guardians.length; ++i) {
            isGuardian[msg.sender][c.guardians[i]] = false;
        }
        delete c.guardians;
        for (uint256 i; i < guardians_.length; ++i) {
            address g = guardians_[i];
            if (g == address(0)) revert ZeroAddress();
            if (isGuardian[msg.sender][g]) revert DuplicateGuardian();
            isGuardian[msg.sender][g] = true;
            c.guardians.push(g);
        }
        c.threshold = threshold_;
        emit GuardiansUpdated(msg.sender, guardians_, threshold_);
    }

    function _validateConfig(address[] calldata guardians_, uint256 threshold_) internal pure {
        if (guardians_.length < MIN_GUARDIANS) revert NotEnoughGuardians();
        if (threshold_ < MIN_GUARDIANS || threshold_ > guardians_.length) revert InvalidThreshold();
    }

    // -------------------------------------------------------------------------
    // Recovery flow
    // -------------------------------------------------------------------------

    /**
     * @notice Anyone can initiate the recovery once they have collected
     *         `threshold` valid signatures from the wallet's guardians.
     *
     *         Each signature must sign the EIP-191 message:
     *           keccak256("WINTG-RECOVER:", wallet, newOwner, nonce)
     */
    function initiateRecovery(address wallet, address newOwner, bytes[] calldata signatures) external nonReentrant {
        Config storage c = _configs[wallet];
        if (!c.configured) revert NotConfigured();
        if (pending[wallet].pending) revert AlreadyPending();
        if (newOwner == address(0)) revert ZeroAddress();
        if (signatures.length < c.threshold) revert InsufficientSignatures(signatures.length, c.threshold);

        bytes32 nonceVal = keccak256(abi.encode("WINTG-RECOVER", wallet, newOwner, recoveryNonce[wallet]));
        bytes32 ethSigned = _ethSignedMessageHash(nonceVal);

        address[] memory seen = new address[](signatures.length);
        uint256 valid;
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(ethSigned, signatures[i]);
            if (!isGuardian[wallet][signer]) revert InvalidSignature();
            // dedup
            for (uint256 j; j < valid; ++j) {
                if (seen[j] == signer) revert DuplicateGuardian();
            }
            seen[valid++] = signer;
        }
        if (valid < c.threshold) revert InsufficientSignatures(valid, c.threshold);

        pending[wallet] = PendingRecovery({
            newOwner: newOwner,
            initiatedAt: uint64(block.timestamp),
            pending: true,
            nonce: nonceVal
        });
        emit RecoveryInitiated(wallet, newOwner, uint64(block.timestamp + TIMELOCK_SECONDS));
    }

    /// @notice Le current owner peut annuler une recovery en cours dans la fenêtre 48h.
    function cancelRecovery(address wallet) external {
        if (IRecoverableWallet(wallet).owner() != msg.sender) revert NotOwner();
        PendingRecovery storage p = pending[wallet];
        if (!p.pending) revert NoPending();
        recoveryNonce[wallet]++; // bump to invalidate signatures already collected
        delete pending[wallet];
        emit RecoveryCanceled(wallet);
    }

    /// @notice After 48h, anyone can finalize the recovery.
    function executeRecovery(address wallet) external nonReentrant {
        PendingRecovery storage p = pending[wallet];
        if (!p.pending) revert NoPending();
        uint64 ready = p.initiatedAt + uint64(TIMELOCK_SECONDS);
        if (block.timestamp < ready) revert NotReady(ready);
        address newOwner = p.newOwner;
        recoveryNonce[wallet]++;
        delete pending[wallet];
        IRecoverableWallet(wallet).setOwnerByModule(newOwner);
        emit RecoveryExecuted(wallet, newOwner);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function configOf(address wallet) external view returns (address[] memory, uint256, bool) {
        Config storage c = _configs[wallet];
        return (c.guardians, c.threshold, c.configured);
    }

    function pendingOf(address wallet) external view returns (PendingRecovery memory) {
        return pending[wallet];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _ethSignedMessageHash(bytes32 hash_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash_));
    }
}
