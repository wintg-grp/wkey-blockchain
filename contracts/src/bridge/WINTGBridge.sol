// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title  WINTGBridge
 * @author WINTG Team
 * @notice Bridge cross-chain pour le WTG natif. Modèle "lock-on-source +
 *         mint-on-destination" géré par un comité de relayers M-of-N.
 *
 *         Direction A (sortie) : WINTG → ETH/BNB/Polygon
 *           1. User appelle `lock()` avec WTG natif + chainId destination
 *           2. Émission événement `Locked` (indexé par les relayers)
 *           3. Relayers signent un message → multisig de threshold M
 *           4. Sur la chaîne destination, contrat miroir mint des WTG-bridged
 *
 *         Direction B (retour) : ETH/BNB/Polygon → WINTG
 *           1. User burn ses WTG-bridged sur la chaîne externe
 *           2. Relayers signent un message d'unlock
 *           3. User (ou keeper) appelle `unlock(...)` avec les signatures
 *           4. Le contrat libère les WTG natifs lockés
 *
 *         Sécurité :
 *           - M-of-N signatures EIP-712 vérifiées on-chain
 *           - Replay protection : `nonce` global incrémenté + bitmap consommée
 *           - Plafond journalier (rate limit) pour limiter le risque de drain
 *           - Pause d'urgence par l'owner (multisig DAO)
 */
contract WINTGBridge is Ownable2Step, ReentrancyGuard, Pausable, EIP712 {
    using Address for address payable;
    using MessageHashUtils for bytes32;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Plafond de unlock sur 24 h (basis points du total locké).
    /// 500 bps = 5 % du total locké par 24 h glissantes.
    uint16 public constant MAX_DAILY_UNLOCK_BPS = 500;

    /// @notice EIP-712 typehash pour les messages d'unlock.
    bytes32 public constant UNLOCK_TYPEHASH =
        keccak256("Unlock(address recipient,uint256 amount,uint64 sourceChainId,bytes32 sourceTxHash,uint256 nonce)");

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Liste des relayers autorisés.
    mapping(address => bool) public isRelayer;
    address[] public relayers;

    /// @notice Threshold M (signatures requises sur N).
    uint256 public threshold;

    /// @notice Bitmap des nonces consommés (anti-replay).
    mapping(uint256 => bool) public usedNonces;

    /// @notice Cumul WTG locké (sur cette chaîne, en attente d'unlock).
    uint256 public totalLocked;

    /// @notice Cumul unlocké sur la fenêtre 24 h en cours.
    uint256 public windowOutflow;
    uint64  public windowStart;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Locked(
        address indexed sender, uint256 amount,
        uint64 indexed destChainId, address indexed destRecipient,
        uint256 sourceNonce
    );
    event Unlocked(
        address indexed recipient, uint256 amount,
        uint64 indexed sourceChainId, bytes32 indexed sourceTxHash,
        uint256 nonce
    );
    event RelayersUpdated(address[] newRelayers, uint256 newThreshold);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error InvalidChain();
    error InvalidThreshold(uint256 t, uint256 n);
    error InsufficientSignatures(uint256 valid, uint256 needed);
    error NonceAlreadyUsed(uint256 nonce);
    error InsufficientLocked(uint256 requested, uint256 available);
    error DailyLimitExceeded(uint256 requested, uint256 remaining);
    error TransferFailed();
    error DuplicateRelayer(address relayer);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner_, address[] memory initialRelayers_, uint256 initialThreshold_)
        Ownable(initialOwner_)
        EIP712("WINTGBridge", "1")
    {
        _setRelayers(initialRelayers_, initialThreshold_);
        windowStart = uint64(block.timestamp);
    }

    receive() external payable {
        // Permet d'augmenter le pool locké manuellement (rare).
    }

    // -------------------------------------------------------------------------
    // Lock — direction sortante
    // -------------------------------------------------------------------------

    /// @notice Compteur de nonce pour les locks sortants (informatif).
    uint256 public lockNonce;

    function lock(uint64 destChainId, address destRecipient) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        if (destChainId == 0) revert InvalidChain();
        if (destRecipient == address(0)) revert ZeroAddress();

        unchecked { lockNonce += 1; }
        totalLocked += msg.value;

        emit Locked(msg.sender, msg.value, destChainId, destRecipient, lockNonce);
    }

    // -------------------------------------------------------------------------
    // Unlock — direction entrante (avec signatures M-of-N)
    // -------------------------------------------------------------------------

    /**
     * @notice Libère `amount` WTG vers `recipient` après vérification des
     *         signatures EIP-712 fournies par les relayers.
     * @param  recipient     Adresse à crediter sur WINTG.
     * @param  amount        Montant en wei.
     * @param  sourceChainId chainId d'origine (ETH=1, BNB=56, Polygon=137...).
     * @param  sourceTxHash  Hash de la tx burn sur la source (pour traçabilité).
     * @param  nonce         Nonce unique global (concaténation chainId + tx + ...).
     * @param  signatures    Tableau de signatures relayer (≥ threshold).
     */
    function unlock(
        address recipient,
        uint256 amount,
        uint64  sourceChainId,
        bytes32 sourceTxHash,
        uint256 nonce,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        if (amount > totalLocked) revert InsufficientLocked(amount, totalLocked);

        bytes32 structHash = keccak256(abi.encode(
            UNLOCK_TYPEHASH, recipient, amount, sourceChainId, sourceTxHash, nonce
        ));
        bytes32 digest = _hashTypedDataV4(structHash);

        uint256 valid = _countValidSignatures(digest, signatures);
        if (valid < threshold) revert InsufficientSignatures(valid, threshold);

        // Rate limit (5 %/24h du locké courant)
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= windowStart + 1 days) {
            windowStart = nowTs;
            windowOutflow = 0;
        }
        uint256 dayLimit = (totalLocked * MAX_DAILY_UNLOCK_BPS) / 10_000;
        uint256 remaining = dayLimit > windowOutflow ? dayLimit - windowOutflow : 0;
        if (amount > remaining) revert DailyLimitExceeded(amount, remaining);
        windowOutflow += amount;

        usedNonces[nonce] = true;
        totalLocked -= amount;

        emit Unlocked(recipient, amount, sourceChainId, sourceTxHash, nonce);

        payable(recipient).sendValue(amount);
    }

    // -------------------------------------------------------------------------
    // Owner — relayers / pause
    // -------------------------------------------------------------------------

    function setRelayers(address[] calldata newRelayers, uint256 newThreshold) external onlyOwner {
        _setRelayers(newRelayers, newThreshold);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _setRelayers(address[] memory newRelayers, uint256 newThreshold) internal {
        if (newThreshold == 0 || newThreshold > newRelayers.length) {
            revert InvalidThreshold(newThreshold, newRelayers.length);
        }
        // Reset
        for (uint256 i = 0; i < relayers.length; i++) {
            isRelayer[relayers[i]] = false;
        }
        delete relayers;

        for (uint256 i = 0; i < newRelayers.length; i++) {
            address r = newRelayers[i];
            if (r == address(0)) revert ZeroAddress();
            if (isRelayer[r]) revert DuplicateRelayer(r);
            isRelayer[r] = true;
            relayers.push(r);
        }
        threshold = newThreshold;
        emit RelayersUpdated(newRelayers, newThreshold);
    }

    // -------------------------------------------------------------------------
    // Internal — signature verification
    // -------------------------------------------------------------------------

    function _countValidSignatures(bytes32 digest, bytes[] calldata signatures)
        internal view returns (uint256 valid)
    {
        // Set inline pour éviter les doublons de signature (un même relayer
        // ne compte qu'une fois).
        address lastAddr;
        for (uint256 i = 0; i < signatures.length; i++) {
            (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signatures[i]);
            if (err != ECDSA.RecoverError.NoError) continue;
            if (!isRelayer[signer]) continue;
            // Force ordering croissant pour exclure les doublons sans set
            if (signer <= lastAddr) continue;
            lastAddr = signer;
            unchecked { valid += 1; }
        }
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function relayersCount() external view returns (uint256) {
        return relayers.length;
    }

    function dailyLimit() external view returns (uint256) {
        return (totalLocked * MAX_DAILY_UNLOCK_BPS) / 10_000;
    }
}
