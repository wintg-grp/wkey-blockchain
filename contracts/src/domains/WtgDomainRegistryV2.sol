// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  WtgDomainRegistryV2
 * @author WINTG Team
 * @notice Registry on-chain pour les noms de domaine `*.wtg`, version 2.
 *
 *         Nouveautés v2 par rapport à v1 :
 *           - Frais 250 WTG/an (au lieu de paramétrable initial)
 *           - **Reverse resolution** : address → primary name
 *           - **Subdomains** : `alice.shop.wtg` géré par owner de shop.wtg
 *             - 1 niveau de profondeur max (ex: alice.shop.wtg)
 *             - gratuit pour le owner du parent
 *             - héritent de l'expiration du parent
 *             - parent peut révoquer
 *           - Premium names (1-2 chars) auto-réservés au treasury
 *           - 30 jours de grace period après expiration (récup prioritaire owner)
 *
 *         Règles validation nom (inchangées) :
 *           - 3-32 chars (root) ou 1-32 chars (subdomain)
 *           - a-z, 0-9, '-' (pas en début/fin, pas de double tiret)
 *           - lowercase only
 *
 *         Modèle de gouvernance :
 *           - `owner` (multisig WINTGTreasury)
 *           - frais paramétrables
 *           - `pauseRegistrations` pour stopper les nouveaux enregistrements
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract WtgDomainRegistryV2 is Ownable2Step, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    string public constant TLD = "wtg";
    uint256 public constant REGISTRATION_PERIOD = 365 days;
    uint256 public constant MAX_RENEWAL_AHEAD   = 5 * 365 days;
    uint256 public constant GRACE_PERIOD        = 30 days;

    uint256 public constant MIN_LENGTH = 3;        // root names
    uint256 public constant MAX_LENGTH = 32;
    uint256 public constant SUBDOMAIN_MIN_LENGTH = 1; // alice.shop.wtg → "alice"

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct Record {
        address owner;
        address resolved;
        uint64  expiresAt;
        string  text;
        // Pour les subdomains
        bytes32 parent;     // bytes32(0) si root domain
        bool    isSubdomain;
    }

    /// @notice mapping nom → record. Clé = keccak256(nom complet sans .wtg).
    ///         Pour subdomain "alice.shop", clé = keccak256("alice.shop").
    mapping(bytes32 => Record) private _records;

    /// @notice Reverse resolution : address → primary nameHash.
    mapping(address => bytes32) public primaryName;

    /// @notice Subdomains list per parent — utile pour révoquer ou lister.
    mapping(bytes32 => bytes32[]) private _subsOfParent;

    /// @notice Frais d'enregistrement / renouvellement (WTG).
    uint256 public registrationFee = 250 ether;

    /// @notice Treasury qui collecte les frais.
    address public treasury;

    /// @notice Si true, plus aucun enregistrement nouveau (renewals OK).
    bool public registrationsPaused;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(bytes32 indexed nameHash_, string name, address indexed owner, address resolved, uint64 expiresAt);
    event NameRenewed(bytes32 indexed nameHash_, string name, address indexed payer, uint64 expiresAt);
    event NameTransferred(bytes32 indexed nameHash_, string name, address indexed previousOwner, address indexed newOwner);
    event NameReleased(bytes32 indexed nameHash_, string name, address indexed previousOwner);
    event ResolvedAddressChanged(bytes32 indexed nameHash_, string name, address indexed resolved);
    event TextRecordChanged(bytes32 indexed nameHash_, string name, string text);
    event SubdomainCreated(bytes32 indexed parentHash, bytes32 indexed subHash, string fullName, address indexed owner);
    event SubdomainRevoked(bytes32 indexed parentHash, bytes32 indexed subHash, string fullName);
    event PrimaryNameSet(address indexed account, bytes32 indexed nameHash_);
    event RegistrationFeeUpdated(uint256 newFee);
    event TreasuryUpdated(address newTreasury);
    event RegistrationsPausedChanged(bool paused);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidName();
    error NameTaken();
    error NameNotOwned();
    error NotNameOwner();
    error NotParentOwner();
    error InsufficientFee();
    error RegistrationsArePaused();
    error InvalidTreasury();
    error TooFarInTheFuture();
    error TransferFailed();
    error NotOwnerOfNameForReverse();
    error CannotSubdivideSubdomain();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
        emit TreasuryUpdated(initialTreasury);
        emit RegistrationFeeUpdated(registrationFee);
    }

    // -------------------------------------------------------------------------
    // Public — root registration
    // -------------------------------------------------------------------------

    function register(string calldata name, address resolved) external payable nonReentrant {
        if (registrationsPaused) revert RegistrationsArePaused();
        if (msg.value < registrationFee) revert InsufficientFee();
        _validateName(name, false);

        bytes32 h = nameHash(name);
        Record storage r = _records[h];

        // Available if : never registered, or expired + grace period passed.
        // Within the grace period, only the previous owner can re-register.
        bool isExpiredAndGraced = r.owner != address(0) &&
            block.timestamp > uint256(r.expiresAt) + GRACE_PERIOD;
        bool isWithinGrace = r.owner != address(0) &&
            block.timestamp > r.expiresAt &&
            block.timestamp <= uint256(r.expiresAt) + GRACE_PERIOD;

        if (r.owner != address(0)) {
            if (r.expiresAt > block.timestamp) revert NameTaken();
            if (isWithinGrace && r.owner != msg.sender) revert NameTaken();
            if (!isExpiredAndGraced && !isWithinGrace) revert NameTaken();
        }

        uint64 newExpiry = uint64(block.timestamp + REGISTRATION_PERIOD);

        // Reset subdomains pointing to the old owner — they'll need re-create.
        if (r.owner != address(0)) {
            _clearAllSubdomainsOf(h);
        }

        r.owner       = msg.sender;
        r.resolved    = resolved;
        r.expiresAt   = newExpiry;
        r.parent      = bytes32(0);
        r.isSubdomain = false;
        delete r.text;

        _forwardFee(msg.value);
        emit NameRegistered(h, name, msg.sender, resolved, newExpiry);

        // Auto-set primary name on first register if none set.
        if (primaryName[msg.sender] == bytes32(0)) {
            primaryName[msg.sender] = h;
            emit PrimaryNameSet(msg.sender, h);
        }
    }

    function renew(string calldata name) external payable nonReentrant {
        if (msg.value < registrationFee) revert InsufficientFee();
        _validateName(name, false);

        bytes32 h = nameHash(name);
        Record storage r = _records[h];
        if (r.owner == address(0)) revert NameNotOwned();
        if (block.timestamp > uint256(r.expiresAt) + GRACE_PERIOD) revert NameNotOwned();

        uint64 newExpiry = uint64(uint256(r.expiresAt) + REGISTRATION_PERIOD);
        if (newExpiry > block.timestamp + MAX_RENEWAL_AHEAD) revert TooFarInTheFuture();

        r.expiresAt = newExpiry;
        _forwardFee(msg.value);
        emit NameRenewed(h, name, msg.sender, newExpiry);
    }

    // -------------------------------------------------------------------------
    // Public — subdomains
    // -------------------------------------------------------------------------

    /**
     * @notice Le owner d'un root name (`shop.wtg`) crée un subdomain
     *         (`alice.shop.wtg`) gratuitement (gas only). Profondeur max 1.
     */
    function createSubdomain(string calldata parentName, string calldata subLabel, address resolvedAddr)
        external
        returns (bytes32 subHash_)
    {
        bytes32 parentHash = nameHash(parentName);
        Record storage parent = _records[parentHash];
        if (parent.owner == address(0) || parent.expiresAt <= block.timestamp) revert NameNotOwned();
        if (parent.owner != msg.sender) revert NotParentOwner();
        if (parent.isSubdomain) revert CannotSubdivideSubdomain();

        // Validate subLabel (loose : 1-32 chars).
        _validateName(subLabel, true);

        string memory fullName = string.concat(subLabel, ".", parentName);
        subHash_ = keccak256(bytes(fullName));

        Record storage sub = _records[subHash_];
        if (sub.owner != address(0)) revert NameTaken();

        sub.owner       = msg.sender; // initially same as parent owner
        sub.resolved    = resolvedAddr;
        sub.expiresAt   = parent.expiresAt; // subdomains inherit parent's expiration
        sub.parent      = parentHash;
        sub.isSubdomain = true;

        _subsOfParent[parentHash].push(subHash_);

        emit SubdomainCreated(parentHash, subHash_, fullName, msg.sender);
    }

    function revokeSubdomain(string calldata parentName, string calldata subLabel) external {
        bytes32 parentHash = nameHash(parentName);
        Record storage parent = _records[parentHash];
        if (parent.owner != msg.sender) revert NotParentOwner();
        string memory fullName = string.concat(subLabel, ".", parentName);
        bytes32 subHash_ = keccak256(bytes(fullName));
        Record storage sub = _records[subHash_];
        if (sub.parent != parentHash) revert NameNotOwned();
        delete _records[subHash_];
        emit SubdomainRevoked(parentHash, subHash_, fullName);
    }

    function _clearAllSubdomainsOf(bytes32 parentHash) internal {
        bytes32[] storage subs = _subsOfParent[parentHash];
        for (uint256 i = 0; i < subs.length; i++) {
            delete _records[subs[i]];
        }
        delete _subsOfParent[parentHash];
    }

    // -------------------------------------------------------------------------
    // Public — name management
    // -------------------------------------------------------------------------

    function setResolvedAddress(string calldata name, address resolved) external {
        bytes32 h = _ownedHash(name);
        _records[h].resolved = resolved;
        emit ResolvedAddressChanged(h, name, resolved);
    }

    function setTextRecord(string calldata name, string calldata text) external {
        bytes32 h = _ownedHash(name);
        _records[h].text = text;
        emit TextRecordChanged(h, name, text);
    }

    function transfer(string calldata name, address newOwner) external {
        if (newOwner == address(0)) revert NotNameOwner();
        bytes32 h = _ownedHash(name);
        address prev = _records[h].owner;
        _records[h].owner = newOwner;
        // Reset primary if old owner had it.
        if (primaryName[prev] == h) {
            primaryName[prev] = bytes32(0);
        }
        emit NameTransferred(h, name, prev, newOwner);
    }

    function release(string calldata name) external {
        bytes32 h = _ownedHash(name);
        address prev = _records[h].owner;
        // Clear subdomains.
        _clearAllSubdomainsOf(h);
        delete _records[h];
        if (primaryName[prev] == h) primaryName[prev] = bytes32(0);
        emit NameReleased(h, name, prev);
    }

    /**
     * @notice Set ce nom comme primary name pour `msg.sender`. Nécessite
     *         que le caller soit owner du nom.
     */
    function setPrimaryName(string calldata name) external {
        bytes32 h = nameHash(name);
        Record storage r = _records[h];
        if (r.owner != msg.sender) revert NotOwnerOfNameForReverse();
        if (r.expiresAt <= block.timestamp) revert NameNotOwned();
        primaryName[msg.sender] = h;
        emit PrimaryNameSet(msg.sender, h);
    }

    function clearPrimaryName() external {
        primaryName[msg.sender] = bytes32(0);
        emit PrimaryNameSet(msg.sender, bytes32(0));
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function nameHash(string memory name) public pure returns (bytes32) {
        return keccak256(bytes(name));
    }

    function recordOf(string calldata name)
        external view returns (address owner_, address resolved, uint64 expiresAt, string memory text)
    {
        Record memory r = _records[nameHash(name)];
        if (r.expiresAt <= block.timestamp) return (address(0), address(0), 0, "");
        return (r.owner, r.resolved, r.expiresAt, r.text);
    }

    function resolve(string calldata name) external view returns (address) {
        Record memory r = _records[nameHash(name)];
        if (r.expiresAt <= block.timestamp) return address(0);
        return r.resolved;
    }

    function isAvailable(string calldata name) external view returns (bool) {
        bytes32 h = nameHash(name);
        Record memory r = _records[h];
        if (r.owner == address(0)) return true;
        if (r.expiresAt > block.timestamp) return false;
        // Within grace period — only old owner can claim, so "not available" for others.
        return block.timestamp > uint256(r.expiresAt) + GRACE_PERIOD;
    }

    function subdomainsOf(string calldata parentName) external view returns (bytes32[] memory) {
        return _subsOfParent[nameHash(parentName)];
    }

    // -------------------------------------------------------------------------
    // Owner functions
    // -------------------------------------------------------------------------

    function setRegistrationFee(uint256 newFee) external onlyOwner {
        registrationFee = newFee;
        emit RegistrationFeeUpdated(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationsPausedChanged(paused);
    }

    /// @notice Réservation de premium names (1-2 chars) au treasury.
    function reservePremium(string[] calldata names) external onlyOwner {
        for (uint256 i; i < names.length; ++i) {
            bytes32 h = nameHash(names[i]);
            Record storage r = _records[h];
            if (r.owner != address(0)) continue;
            r.owner = treasury;
            r.resolved = address(0);
            r.expiresAt = type(uint64).max; // infinite, treasury holds
            emit NameRegistered(h, names[i], treasury, address(0), type(uint64).max);
        }
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _ownedHash(string calldata name) internal view returns (bytes32) {
        bytes32 h = nameHash(name);
        Record storage r = _records[h];
        if (r.owner == address(0) || r.expiresAt <= block.timestamp) revert NameNotOwned();
        if (r.owner != msg.sender) revert NotNameOwner();
        return h;
    }

    function _forwardFee(uint256 amount) internal {
        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _validateName(string calldata name, bool isSubdomain) internal pure {
        bytes calldata b = bytes(name);
        uint256 len = b.length;
        uint256 minLen = isSubdomain ? SUBDOMAIN_MIN_LENGTH : MIN_LENGTH;
        if (len < minLen || len > MAX_LENGTH) revert InvalidName();
        if (b[0] == 0x2d || b[len - 1] == 0x2d) revert InvalidName();
        bool prevHyphen = false;
        for (uint256 i = 0; i < len; ++i) {
            bytes1 c = b[i];
            bool isLower  = (c >= 0x61 && c <= 0x7a);
            bool isDigit  = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2d);
            if (!isLower && !isDigit && !isHyphen) revert InvalidName();
            if (isHyphen && prevHyphen) revert InvalidName();
            prevHyphen = isHyphen;
        }
    }
}
