// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC20}            from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit}      from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ECDSA}            from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl}    from "@openzeppelin/contracts/access/AccessControl.sol";

import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  StableERC20
 * @author WINTG Team
 * @notice Base abstraite pour les stablecoins WINTG (USDW, WCFA).
 *
 *         Mint et burn sont gérés par le `MINTER_ROLE` (typiquement le
 *         `Vault` collatéralisé associé). Inclut Permit + EIP-3009 + Pausable
 *         (urgence), ainsi que `logoURI` modifiable par l'admin.
 *
 *         `verificationTier` est posé par le multisig à WintgOfficial.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, AccessControl, NatSpec.
 */
abstract contract StableERC20 is ERC20, ERC20Permit, AccessControl, IVerifiableAsset {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    Tier public verificationTier;
    address public immutable verificationRegistry;

    string private _logoURI;
    bool   public paused;

    mapping(address => mapping(bytes32 => bool)) private _authState;

    event LogoURIChanged(string newURI);
    event VerificationTierUpdated(Tier indexed previous, Tier indexed current);
    event Paused();
    event Unpaused();
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error InvalidLogoURI();
    error NotVerificationRegistry();
    error PausedNow();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed();
    error InvalidSignature();
    error CallerMustBeRecipient();

    constructor(
        string memory name_,
        string memory symbol_,
        address admin_,
        address registry_,
        string memory logoURI_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        verificationRegistry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE,        admin_);
        _grantRole(PAUSER_ROLE,        admin_);
        if (bytes(logoURI_).length > 0) {
            _validateURI(logoURI_);
            _logoURI = logoURI_;
            emit LogoURIChanged(logoURI_);
        }
    }

    // -------------------------------------------------------------------------
    // Mint / burn (controlled by MINTER_ROLE — typically the Vault contract)
    // -------------------------------------------------------------------------

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }

    // -------------------------------------------------------------------------
    // Pause (urgence)
    // -------------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        paused = false;
        emit Unpaused();
    }

    // -------------------------------------------------------------------------
    // logoURI / verificationTier
    // -------------------------------------------------------------------------

    function logoURI() external view returns (string memory) {
        return _logoURI;
    }

    function setLogoURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateURI(uri);
        _logoURI = uri;
        emit LogoURIChanged(uri);
    }

    function setVerificationTier(Tier newTier) external override {
        if (msg.sender != verificationRegistry) revert NotVerificationRegistry();
        Tier prev = verificationTier;
        verificationTier = newTier;
        emit VerificationTierUpdated(prev, newTier);
    }

    function _validateURI(string memory u) internal pure {
        uint256 len = bytes(u).length;
        if (len < 7 || len > 256) revert InvalidLogoURI();
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
        if (paused) revert PausedNow();
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

    // -------------------------------------------------------------------------
    // Pause check on every transfer
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256 value) internal override {
        if (paused && from != address(0) && to != address(0)) revert PausedNow();
        super._update(from, to, value);
    }
}
