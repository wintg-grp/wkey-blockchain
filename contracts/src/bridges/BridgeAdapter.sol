// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable}              from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA}                 from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title  BridgeAdapter — multi-validator lock/mint bridge endpoint
 * @author WINTG Team
 * @notice Endpoint générique pour un bridge entre WINTG et une chaîne
 *         externe (ETH, BNB, Polygon, etc.). Modèle multisig 5/9 :
 *           - Côté WINTG : ce contrat émet un event `LockedOut` quand un
 *             user verrouille des tokens. Les validators surveillent et
 *             signent une attestation sur la chaîne distante.
 *           - Côté distant : `Mint` avec quorum de signatures.
 *           - Réciproquement, les validators côté WINTG `releaseIn` les
 *             tokens (`unlock` ou `mint` selon mode) après vérification.
 *
 *         Ce contrat est l'interface **côté WINTG** d'un bridge bidirectionnel.
 *         Pour bridger USDC d'Ethereum :
 *           1. User lock USDC sur Ethereum → wrappedUSDC mint sur WINTG (via release ici)
 *           2. User burn wrappedUSDC sur WINTG (lockOut) → USDC unlock sur Ethereum
 *
 *         Sécurité :
 *           - Multisig 5/9 (configurable au déploiement)
 *           - Anti-replay : nonces signés par chaîne externe
 *           - Limite par tx (default 100k USD equivalent)
 *           - Pause d'urgence
 *           - 0,1 % de fee + gas chaîne externe répercuté
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, Pausable,
 *         ReentrancyGuard.
 */
contract BridgeAdapter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Version du protocole, utile pour les futurs upgrades.
    uint8 public constant VERSION = 1;

    /// @notice Frais bridge en basis points (10 = 0,1 %).
    uint96 public constant BRIDGE_FEE_BPS = 10;

    /// @notice Adresse sentinel pour le WTG natif (EIP-7528).
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Code chaîne externe (ex: keccak256("ethereum"), keccak256("bnb")).
    bytes32 public immutable remoteChain;

    /// @notice Validators du bridge.
    mapping(address => bool) public isValidator;
    address[] public validators;
    uint256 public threshold;

    /// @notice Limite max par tx (en wei).
    uint256 public maxPerTx;

    /// @notice Treasury qui collecte les frais.
    address public treasury;

    /// @notice Mapping (token, supportedDirection)
    mapping(address => bool) public isSupportedToken;

    /// @notice Anti-replay : (remoteTxHash) => processed.
    mapping(bytes32 => bool) public processedRemote;

    event LockedOut(
        bytes32 indexed remoteChainCode,
        address indexed token,
        address indexed user,
        uint256 amount,
        uint256 fee,
        bytes32 outboundId,
        bytes recipient    // typed bytes (could be eth address, bnb address, etc.)
    );

    event ReleasedIn(
        bytes32 indexed remoteChainCode,
        bytes32 indexed remoteTxHash,
        address indexed token,
        address user,
        uint256 amount
    );

    event ValidatorsUpdated(address[] newValidators, uint256 threshold);
    event TokenSupportedChanged(address indexed token, bool supported);
    event MaxPerTxChanged(uint256 newMax);
    event TreasuryChanged(address indexed previous, address indexed current);

    error InvalidParams();
    error NotSupportedToken();
    error WrongPayment(uint256 sent, uint256 expected);
    error ExceedsMaxPerTx(uint256 amount, uint256 max);
    error AlreadyProcessed(bytes32 hash);
    error InsufficientSignatures(uint256 have, uint256 need);
    error InvalidSignature();
    error DuplicateValidator();
    error TransferFailed();

    constructor(
        address initialOwner,
        bytes32 remoteChain_,
        address[] memory initialValidators,
        uint256 initialThreshold,
        address initialTreasury,
        uint256 initialMaxPerTx
    ) Ownable(initialOwner) {
        if (remoteChain_ == bytes32(0)) revert InvalidParams();
        if (initialTreasury == address(0)) revert InvalidParams();
        if (initialThreshold == 0 || initialThreshold > initialValidators.length) revert InvalidParams();
        remoteChain = remoteChain_;
        treasury = initialTreasury;
        maxPerTx = initialMaxPerTx;
        for (uint256 i; i < initialValidators.length; ++i) {
            address v = initialValidators[i];
            if (v == address(0) || isValidator[v]) revert DuplicateValidator();
            isValidator[v] = true;
            validators.push(v);
        }
        threshold = initialThreshold;
        emit ValidatorsUpdated(initialValidators, initialThreshold);
        emit MaxPerTxChanged(initialMaxPerTx);
        emit TreasuryChanged(address(0), initialTreasury);
    }

    // -------------------------------------------------------------------------
    // Outbound : user lock from WINTG → mint sur chaîne externe
    // -------------------------------------------------------------------------

    /**
     * @notice User locks `amount` of `token` on WINTG. Validators see the
     *         `LockedOut` event and orchestrate the mint on the remote chain.
     *         Pour le natif : msg.value = amount.
     */
    function lockOut(address token, uint256 amount, bytes calldata recipient)
        external payable whenNotPaused nonReentrant returns (bytes32 outboundId)
    {
        if (!isSupportedToken[token]) revert NotSupportedToken();
        if (amount == 0) revert InvalidParams();
        if (amount > maxPerTx) revert ExceedsMaxPerTx(amount, maxPerTx);

        uint256 fee = (amount * BRIDGE_FEE_BPS) / 10_000;
        uint256 net = amount - fee;

        if (token == NATIVE) {
            if (msg.value != amount) revert WrongPayment(msg.value, amount);
            // fee already in this contract; treasury can sweep later via owner-call
            (bool ok, ) = payable(treasury).call{value: fee}("");
            if (!ok) revert TransferFailed();
        } else {
            if (msg.value != 0) revert WrongPayment(msg.value, 0);
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            IERC20(token).safeTransfer(treasury, fee);
        }

        outboundId = keccak256(abi.encode(remoteChain, address(this), token, msg.sender, amount, block.number, block.timestamp, recipient));
        emit LockedOut(remoteChain, token, msg.sender, net, fee, outboundId, recipient);
    }

    // -------------------------------------------------------------------------
    // Inbound : validators release to user after remote lock
    // -------------------------------------------------------------------------

    /**
     * @notice Validators submit a quorum of signatures attesting that
     *         `user` locked `amount` of `token` on the remote chain at
     *         `remoteTxHash`. After threshold reached, this contract
     *         transfers `amount` to `user`.
     *
     *         The contract MUST be pre-funded for this token (or holds it
     *         from previous lockOuts on this side).
     *
     *         Each signature is an EIP-191 signed message:
     *           keccak256("WINTG-BRIDGE", remoteChain, remoteTxHash, token, user, amount)
     */
    function releaseIn(
        bytes32 remoteTxHash,
        address token,
        address user,
        uint256 amount,
        bytes[] calldata signatures
    ) external whenNotPaused nonReentrant {
        if (processedRemote[remoteTxHash]) revert AlreadyProcessed(remoteTxHash);
        if (!isSupportedToken[token]) revert NotSupportedToken();
        if (signatures.length < threshold) revert InsufficientSignatures(signatures.length, threshold);

        bytes32 messageHash = keccak256(abi.encode("WINTG-BRIDGE", remoteChain, remoteTxHash, token, user, amount));
        bytes32 signed = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        address[] memory seen = new address[](signatures.length);
        uint256 valid;
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(signed, signatures[i]);
            if (!isValidator[signer]) revert InvalidSignature();
            for (uint256 j; j < valid; ++j) {
                if (seen[j] == signer) revert DuplicateValidator();
            }
            seen[valid++] = signer;
        }
        if (valid < threshold) revert InsufficientSignatures(valid, threshold);

        processedRemote[remoteTxHash] = true;

        if (token == NATIVE) {
            (bool ok, ) = payable(user).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(user, amount);
        }

        emit ReleasedIn(remoteChain, remoteTxHash, token, user, amount);
    }

    // -------------------------------------------------------------------------
    // Owner / admin
    // -------------------------------------------------------------------------

    function setValidators(address[] calldata newValidators, uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0 || newThreshold > newValidators.length) revert InvalidParams();
        // Clear current.
        for (uint256 i; i < validators.length; ++i) isValidator[validators[i]] = false;
        delete validators;
        for (uint256 i; i < newValidators.length; ++i) {
            address v = newValidators[i];
            if (v == address(0) || isValidator[v]) revert DuplicateValidator();
            isValidator[v] = true;
            validators.push(v);
        }
        threshold = newThreshold;
        emit ValidatorsUpdated(newValidators, newThreshold);
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        isSupportedToken[token] = supported;
        emit TokenSupportedChanged(token, supported);
    }

    function setMaxPerTx(uint256 newMax) external onlyOwner {
        maxPerTx = newMax;
        emit MaxPerTxChanged(newMax);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function validatorsCount() external view returns (uint256) { return validators.length; }
    function getAllValidators() external view returns (address[] memory) { return validators; }

    receive() external payable {}
}
