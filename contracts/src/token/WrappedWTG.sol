// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC20}            from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit}      from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ECDSA}            from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  WrappedWTG (WWTG)
 * @author WINTG Team
 * @notice ERC-20 wrapper 1:1 du WTG natif. `deposit()` mint, `withdraw()`
 *         burn et renvoie le WTG.
 *
 *         Inclut EIP-2612 permit + EIP-3009 transferWithAuthorization pour
 *         compat paiements gasless. Pas de Cap, pas de Votes, pas de
 *         Soulbound — c'est un wrapper, pas un token de gouvernance.
 *
 *         `verificationTier` est posé par le multisig à WintgOfficial après
 *         déploiement, via le `VerificationRegistry`.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, NatSpec.
 *         Le contrat ne peut PAS retirer le collatéral — strictement 1:1.
 */
contract WrappedWTG is ERC20, ERC20Permit, Ownable2Step, IVerifiableAsset {
    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    /// @notice Verification tier (posé par le registry).
    Tier public verificationTier;
    address public immutable verificationRegistry;

    string private _logoURI;

    /// @dev EIP-3009 nonces.
    mapping(address => mapping(bytes32 => bool)) private _authState;

    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);
    event LogoURIChanged(string newURI);
    event VerificationTierUpdated(Tier indexed previous, Tier indexed current);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error NotVerificationRegistry();
    error WithdrawTransferFailed();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed();
    error InvalidSignature();
    error CallerMustBeRecipient();
    error InvalidLogoURI();

    constructor(address initialOwner, address registry_, string memory logoURI_)
        ERC20("Wrapped WINTG", "WWTG")
        ERC20Permit("Wrapped WINTG")
        Ownable(initialOwner)
    {
        verificationRegistry = registry_;
        if (bytes(logoURI_).length > 0) {
            if (bytes(logoURI_).length < 7 || bytes(logoURI_).length > 256) revert InvalidLogoURI();
            _logoURI = logoURI_;
            emit LogoURIChanged(logoURI_);
        }
    }

    // -------------------------------------------------------------------------
    // Wrap / unwrap
    // -------------------------------------------------------------------------

    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Receive native WTG → mint WWTG 1:1 to the sender.
    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawTransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // logoURI / verificationTier
    // -------------------------------------------------------------------------

    function logoURI() external view returns (string memory) {
        return _logoURI;
    }

    function setLogoURI(string calldata uri) external onlyOwner {
        if (bytes(uri).length < 7 || bytes(uri).length > 256) revert InvalidLogoURI();
        _logoURI = uri;
        emit LogoURIChanged(uri);
    }

    function setVerificationTier(Tier newTier) external override {
        if (msg.sender != verificationRegistry) revert NotVerificationRegistry();
        Tier prev = verificationTier;
        verificationTier = newTier;
        emit VerificationTierUpdated(prev, newTier);
    }

    // -------------------------------------------------------------------------
    // EIP-3009
    // -------------------------------------------------------------------------

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authState[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from, address to, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        _checkAuth(from, validAfter, validBefore, nonce);
        bytes32 structHash = keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        _consumeAuth(from, nonce, structHash, v, r, s);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        if (msg.sender != to) revert CallerMustBeRecipient();
        _checkAuth(from, validAfter, validBefore, nonce);
        bytes32 structHash = keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        _consumeAuth(from, nonce, structHash, v, r, s);
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (_authState[authorizer][nonce]) revert AuthorizationAlreadyUsed();
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, v, r, s) != authorizer) revert InvalidSignature();
        _authState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _checkAuth(address authorizer, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view {
        if (block.timestamp <= validAfter)  revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authState[authorizer][nonce])  revert AuthorizationAlreadyUsed();
    }

    function _consumeAuth(address authorizer, bytes32 nonce, bytes32 structHash, uint8 v, bytes32 r, bytes32 s) internal {
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, v, r, s) != authorizer) revert InvalidSignature();
        _authState[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, nonce);
    }
}
