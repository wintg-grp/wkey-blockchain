// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC20}            from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Capped}      from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Permit}      from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes}       from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces}           from "@openzeppelin/contracts/utils/Nonces.sol";
import {AccessControl}    from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712}           from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA}            from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  SimpleERC20V2
 * @author WINTG Team
 * @notice Token ERC-20 polyvalent déployé via la `ERC20Factory` v2.
 *
 *         Features intégrées (toutes activables au déploiement) :
 *           - Always-on : EIP-2612 permit, EIP-3009 transferWithAuthorization,
 *             logoURI on-chain, verificationTier on-chain, airdrop natif
 *             multi-destinataires (gas saving).
 *           - Opt-in : ERC20Votes (snapshots + délégation), Mintable Cap
 *             (émission progressive avec plafond décroissable), Soulbound
 *             (transferts désactivés).
 *
 *         Compatibilité croisée :
 *           - Soulbound désactive permit, EIP-3009 et approve (revert).
 *           - Soulbound + Votes : compatible (utile pour DAO membership).
 *           - Mintable Cap + Votes : compatible (snapshot pris au mint).
 *           - logoURI modifiable 1 seule fois dans les 15 premiers jours,
 *             puis lock définitif.
 *
 * @dev    OpenZeppelin v5, NatSpec, Apache-2.0, conformes WINTG.
 */
contract SimpleERC20V2 is ERC20, ERC20Capped, ERC20Permit, ERC20Votes, AccessControl, IVerifiableAsset {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Role qui peut minter des tokens (si mintable activé).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Délai après création pendant lequel le logo peut être modifié.
    uint256 public constant LOGO_MUTABILITY_WINDOW = 15 days;

    /// @notice Bornes de longueur pour l'URI du logo.
    uint256 public constant LOGO_URI_MIN = 7;
    uint256 public constant LOGO_URI_MAX = 256;

    /// @notice Limite max du multi-sender natif.
    uint256 public constant MAX_AIRDROP_RECIPIENTS = 500;

    /// @dev Type hash EIP-3009.
    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // -------------------------------------------------------------------------
    // Storage — features flags (immutable after deployment)
    // -------------------------------------------------------------------------

    /// @notice Si true, le token est non-transférable. Permit / EIP-3009 désactivés.
    bool public immutable isSoulbound;

    /// @notice Si true, ERC20Votes est activé : snapshots + délégation.
    bool public immutable hasVotes;

    /// @notice Si true, le supply peut être augmenté jusqu'au cap par MINTER_ROLE.
    bool public immutable isMintable;

    // -------------------------------------------------------------------------
    // Storage — logo (modifiable 15 jours, puis lock)
    // -------------------------------------------------------------------------

    string private _logoURI;
    bool private _logoLocked;
    /// @notice Timestamp de création — utilisé pour vérifier la fenêtre de 15j.
    uint64 public immutable createdAt;

    // -------------------------------------------------------------------------
    // Storage — verification tier
    // -------------------------------------------------------------------------

    Tier public verificationTier;

    /// @notice Adresse du `VerificationRegistry` autorisé à modifier le tier.
    address public immutable verificationRegistry;

    // -------------------------------------------------------------------------
    // Storage — minting cap & finished flag
    // -------------------------------------------------------------------------

    uint256 private _cap;
    bool public mintingFinished;

    // -------------------------------------------------------------------------
    // Storage — EIP-3009 nonces
    // -------------------------------------------------------------------------

    /// @notice authorizer => nonce => used
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event LogoURIChanged(string newURI);
    event LogoLocked();

    event VerificationTierUpdated(Tier indexed previous, Tier indexed current);

    event CapDecreased(uint256 newCap);
    event MintingFinished();

    event BulkSent(address indexed from, uint256 totalAmount, uint256 recipientCount);

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error SoulboundLocked();
    error MintNotEnabled();
    error MintAlreadyFinished();
    error InvalidCap();
    error CapBelowSupply();
    error LogoURIInvalid();
    error LogoLockedAlready();
    error LogoMutationWindowExpired();
    error NotVerificationRegistry();
    error AirdropLengthMismatch();
    error AirdropTooMany();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed();
    error InvalidSignature();
    error CallerMustBeRecipient();

    // -------------------------------------------------------------------------
    // Constructor — params packed in struct to avoid stack-too-deep
    // -------------------------------------------------------------------------

    struct Config {
        string name;
        string symbol;
        uint256 cap_;
        uint256 initialSupply;
        address admin;       // receives initial supply, gets DEFAULT_ADMIN_ROLE + MINTER_ROLE
        bool isSoulbound;
        bool hasVotes;
        bool isMintable;
        string logoURI;
        address verificationRegistry;
    }

    constructor(Config memory cfg)
        ERC20(cfg.name, cfg.symbol)
        ERC20Capped(cfg.cap_ == 0 ? type(uint208).max : cfg.cap_)
        ERC20Permit(cfg.name)
    {
        // Capped requires cap >= initial supply.
        if (cfg.cap_ != 0 && cfg.cap_ < cfg.initialSupply) revert CapBelowSupply();

        isSoulbound          = cfg.isSoulbound;
        hasVotes             = cfg.hasVotes;
        isMintable           = cfg.isMintable;
        verificationRegistry = cfg.verificationRegistry;
        createdAt            = uint64(block.timestamp);
        _cap                 = cfg.cap_ == 0 ? type(uint208).max : cfg.cap_;

        // Initial logo (optional).
        if (bytes(cfg.logoURI).length > 0) {
            _validateLogoURI(cfg.logoURI);
            _logoURI = cfg.logoURI;
            emit LogoURIChanged(cfg.logoURI);
        }

        // Setup roles.
        _grantRole(DEFAULT_ADMIN_ROLE, cfg.admin);
        _grantRole(MINTER_ROLE,        cfg.admin);

        // Initial mint to admin.
        if (cfg.initialSupply > 0) {
            _mint(cfg.admin, cfg.initialSupply);
        }
    }

    // -------------------------------------------------------------------------
    // Logo URI (R1-R4 of design)
    // -------------------------------------------------------------------------

    function logoURI() external view returns (string memory) {
        return _logoURI;
    }

    function logoLocked() external view returns (bool) {
        return _logoLocked || (block.timestamp > createdAt + LOGO_MUTABILITY_WINDOW);
    }

    /**
     * @notice Modifie le logo. Ne peut être appelé qu'UNE seule fois dans
     *         les 15 premiers jours après le déploiement. Après, lock
     *         définitif.
     */
    function setLogoURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_logoLocked) revert LogoLockedAlready();
        if (block.timestamp > createdAt + LOGO_MUTABILITY_WINDOW) revert LogoMutationWindowExpired();
        _validateLogoURI(uri);
        _logoURI = uri;
        _logoLocked = true; // 1 seule modif autorisée
        emit LogoURIChanged(uri);
        emit LogoLocked();
    }

    function _validateLogoURI(string memory uri) internal pure {
        uint256 len = bytes(uri).length;
        if (len < LOGO_URI_MIN || len > LOGO_URI_MAX) revert LogoURIInvalid();
    }

    // -------------------------------------------------------------------------
    // Verification tier — IVerifiableAsset
    // -------------------------------------------------------------------------

    function setVerificationTier(Tier newTier) external override {
        if (msg.sender != verificationRegistry) revert NotVerificationRegistry();
        Tier prev = verificationTier;
        verificationTier = newTier;
        emit VerificationTierUpdated(prev, newTier);
    }

    // -------------------------------------------------------------------------
    // Mintable + Cap (decreasable only)
    // -------------------------------------------------------------------------

    function cap() public view override(ERC20Capped) returns (uint256) {
        return _cap;
    }

    function decreaseCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap >= _cap) revert InvalidCap();
        if (newCap < totalSupply()) revert CapBelowSupply();
        _cap = newCap;
        emit CapDecreased(newCap);
    }

    function finishMinting() external onlyRole(DEFAULT_ADMIN_ROLE) {
        mintingFinished = true;
        emit MintingFinished();
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (!isMintable) revert MintNotEnabled();
        if (mintingFinished) revert MintAlreadyFinished();
        _mint(to, amount);
    }

    // -------------------------------------------------------------------------
    // Multi-sender natif (gas saving — pas d'approve)
    // -------------------------------------------------------------------------

    /**
     * @notice Envoie le token à N destinataires en 1 seule tx. Limit 500.
     *         Montants individuels. Pour montants égaux, passez le même
     *         montant dans le tableau ; pour les autres ERC-20, utilisez
     *         `WintgMultiSender`.
     */
    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external returns (uint256 total) {
        if (recipients.length != amounts.length) revert AirdropLengthMismatch();
        if (recipients.length > MAX_AIRDROP_RECIPIENTS) revert AirdropTooMany();
        for (uint256 i; i < recipients.length; ++i) {
            _transfer(msg.sender, recipients[i], amounts[i]);
            total += amounts[i];
        }
        emit BulkSent(msg.sender, total, recipients.length);
    }

    // -------------------------------------------------------------------------
    // Soulbound — block transfers and approvals
    // -------------------------------------------------------------------------

    function approve(address spender, uint256 value) public override returns (bool) {
        if (isSoulbound) revert SoulboundLocked();
        return super.approve(spender, value);
    }

    /// @inheritdoc ERC20Permit
    function permit(
        address ownerAddr,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override(ERC20Permit) {
        if (isSoulbound) revert SoulboundLocked();
        super.permit(ownerAddr, spender, value, deadline, v, r, s);
    }

    // -------------------------------------------------------------------------
    // EIP-3009 — transferWithAuthorization / receiveWithAuthorization / cancelAuthorization
    // -------------------------------------------------------------------------

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _checkAuthorization(from, validAfter, validBefore, nonce);
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _consumeAuthorization(from, nonce, structHash, v, r, s);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (msg.sender != to) revert CallerMustBeRecipient();
        _checkAuthorization(from, validAfter, validBefore, nonce);
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _consumeAuthorization(from, nonce, structHash, v, r, s);
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (isSoulbound) revert SoulboundLocked();
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationAlreadyUsed();
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, v, r, s) != authorizer) revert InvalidSignature();
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _checkAuthorization(address authorizer, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view {
        if (isSoulbound) revert SoulboundLocked();
        if (block.timestamp <= validAfter)  revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationAlreadyUsed();
    }

    function _consumeAuthorization(address authorizer, bytes32 nonce, bytes32 structHash, uint8 v, bytes32 r, bytes32 s) internal {
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, v, r, s) != authorizer) revert InvalidSignature();
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, nonce);
    }

    // -------------------------------------------------------------------------
    // ERC20Votes — clock mode timestamp + auto-delegation
    // -------------------------------------------------------------------------

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /// @dev Required by ERC20Votes v5 alongside `clock()`.
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // -------------------------------------------------------------------------
    // Internal — _update (combine ERC20Capped + ERC20Votes + soulbound + auto-delegate)
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Capped, ERC20Votes) {
        // Soulbound : refuse les transferts user-to-user. Mint (from == 0)
        // et burn (to == 0) restent autorisés.
        if (isSoulbound && from != address(0) && to != address(0)) revert SoulboundLocked();

        super._update(from, to, value);

        // Auto-delegate to self au premier reçu (si Votes activé).
        if (hasVotes && to != address(0) && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }

    function nonces(address ownerAddr) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(ownerAddr);
    }
}
