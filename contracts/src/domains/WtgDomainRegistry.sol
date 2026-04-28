// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  WtgDomainRegistry
 * @author WINTG Team
 * @notice Registry on-chain pour les noms de domaine `*.wtg`.
 *
 *         Le but de ce contrat est de fournir une résolution
 *         nom-vers-adresse simple, auditable et permissionless, sans
 *         dépendance à un registre off-chain. Il est intentionnellement
 *         minimaliste pour la phase 1 — pas de proxy, pas de système
 *         d'enchères, pas de transferts via NFT. Une v2 plus riche
 *         viendra avec la phase écosystème.
 *
 *         Règles :
 *           - Un nom est une chaîne ASCII en bas de casse (a-z, 0-9, '-'),
 *             entre 3 et 32 caractères, sans tiret en première / dernière
 *             position et sans tirets consécutifs.
 *           - Un nom s'enregistre pour une période d'1 an, avec
 *             renouvellement glissant (jusqu'à 5 ans en avance).
 *           - L'enregistrement coûte un montant en WTG (`registrationFee`)
 *             versé au treasury (`treasury`). Ce coût est paramétrable par
 *             l'owner du contrat (le multisig WINTG).
 *           - Le propriétaire d'un nom peut :
 *               * définir l'adresse vers laquelle le nom résout
 *               * transférer la propriété
 *               * définir un text record (libre)
 *               * libérer le nom
 *           - À l'expiration, le nom redevient disponible.
 *
 * @dev    Le contrat n'expose volontairement pas de fonctions admin pour
 *         saisir un nom appartenant à un tiers. La seule capacité
 *         exceptionnelle est `pauseRegistrations()` pour stopper les
 *         nouveaux enregistrements en cas d'incident, sans toucher aux
 *         enregistrements existants.
 */
contract WtgDomainRegistry is Ownable2Step, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice TLD réservée à ce registre. Présente pour la traçabilité.
    string public constant TLD = "wtg";

    /// @notice Période d'enregistrement nominale.
    uint256 public constant REGISTRATION_PERIOD = 365 days;

    /// @notice Renouvellement maximal cumulé.
    uint256 public constant MAX_RENEWAL_AHEAD = 5 * 365 days;

    /// @notice Bornes de longueur du nom.
    uint256 public constant MIN_LENGTH = 3;
    uint256 public constant MAX_LENGTH = 32;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct Record {
        address owner;       // propriétaire du nom
        address resolved;    // adresse vers laquelle le nom résout
        uint64  expiresAt;   // timestamp UNIX d'expiration
        string  text;        // text record optionnel
    }

    /// @notice Mapping nom => record.
    mapping(bytes32 => Record) private _records;

    /// @notice Frais d'enregistrement / renouvellement (en wei = WTG natif).
    uint256 public registrationFee;

    /// @notice Adresse qui collecte les frais (treasury multisig).
    address public treasury;

    /// @notice Si true, plus aucun nouvel enregistrement n'est accepté
    ///         (les renouvellements et les opérations sur les noms existants
    ///         restent permises).
    bool public registrationsPaused;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(
        bytes32 indexed nameHash,
        string  name,
        address indexed owner,
        address resolved,
        uint64  expiresAt
    );
    event NameRenewed(
        bytes32 indexed nameHash,
        string  name,
        address indexed payer,
        uint64  expiresAt
    );
    event NameTransferred(
        bytes32 indexed nameHash,
        string  name,
        address indexed previousOwner,
        address indexed newOwner
    );
    event NameReleased(
        bytes32 indexed nameHash,
        string  name,
        address indexed previousOwner
    );
    event ResolvedAddressChanged(
        bytes32 indexed nameHash,
        string  name,
        address indexed resolved
    );
    event TextRecordChanged(
        bytes32 indexed nameHash,
        string  name,
        string  text
    );
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
    error InsufficientFee();
    error RegistrationsArePaused();
    error InvalidTreasury();
    error TooFarInTheFuture();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialTreasury, uint256 initialFee)
        Ownable(initialOwner)
    {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
        registrationFee = initialFee;
        emit TreasuryUpdated(initialTreasury);
        emit RegistrationFeeUpdated(initialFee);
    }

    // -------------------------------------------------------------------------
    // Public — registration
    // -------------------------------------------------------------------------

    /**
     * @notice Enregistre un nom pour 1 an.
     * @param  name      Le nom à enregistrer (sans suffixe ".wtg").
     * @param  resolved  Adresse vers laquelle le nom résout (peut être 0).
     */
    function register(string calldata name, address resolved) external payable nonReentrant {
        if (registrationsPaused) revert RegistrationsArePaused();
        if (msg.value < registrationFee) revert InsufficientFee();
        _validateName(name);

        bytes32 h = nameHash(name);
        Record storage r = _records[h];

        // Disponible si pas encore enregistré, ou si l'enregistrement a expiré.
        if (r.owner != address(0) && r.expiresAt > block.timestamp) revert NameTaken();

        uint64 newExpiry = uint64(block.timestamp + REGISTRATION_PERIOD);

        r.owner     = msg.sender;
        r.resolved  = resolved;
        r.expiresAt = newExpiry;
        // Reset text record si on récupère un nom expiré.
        delete r.text;

        _forwardFee(msg.value);

        emit NameRegistered(h, name, msg.sender, resolved, newExpiry);
    }

    /**
     * @notice Renouvelle un nom (prolonge la durée d'enregistrement). N'importe
     *         qui peut payer le renouvellement, mais l'expiration reste sur
     *         l'enregistrement existant.
     */
    function renew(string calldata name) external payable nonReentrant {
        if (msg.value < registrationFee) revert InsufficientFee();
        _validateName(name);

        bytes32 h = nameHash(name);
        Record storage r = _records[h];
        if (r.owner == address(0) || r.expiresAt <= block.timestamp) revert NameNotOwned();

        uint64 newExpiry = uint64(uint256(r.expiresAt) + REGISTRATION_PERIOD);
        if (newExpiry > block.timestamp + MAX_RENEWAL_AHEAD) revert TooFarInTheFuture();

        r.expiresAt = newExpiry;

        _forwardFee(msg.value);

        emit NameRenewed(h, name, msg.sender, newExpiry);
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
        emit NameTransferred(h, name, prev, newOwner);
    }

    function release(string calldata name) external {
        bytes32 h = _ownedHash(name);
        address prev = _records[h].owner;
        delete _records[h];
        emit NameReleased(h, name, prev);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Hash canonique d'un nom (lower-case, sans suffixe).
    function nameHash(string memory name) public pure returns (bytes32) {
        return keccak256(bytes(name));
    }

    /**
     * @notice Récupère l'enregistrement complet. Si le nom est expiré, retourne
     *         un record nul.
     */
    function recordOf(string calldata name)
        external
        view
        returns (address owner_, address resolved, uint64 expiresAt, string memory text)
    {
        Record memory r = _records[nameHash(name)];
        if (r.expiresAt <= block.timestamp) {
            return (address(0), address(0), 0, "");
        }
        return (r.owner, r.resolved, r.expiresAt, r.text);
    }

    /// @notice Résolution simple : nom => adresse (0 si inexistant ou expiré).
    function resolve(string calldata name) external view returns (address) {
        Record memory r = _records[nameHash(name)];
        if (r.expiresAt <= block.timestamp) return address(0);
        return r.resolved;
    }

    /// @notice Disponibilité : true si le nom peut être enregistré maintenant.
    function isAvailable(string calldata name) external view returns (bool) {
        bytes32 h = nameHash(name);
        Record memory r = _records[h];
        return r.owner == address(0) || r.expiresAt <= block.timestamp;
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

    // -------------------------------------------------------------------------
    // Internal helpers
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

    /**
     * @dev Valide un nom : longueur 3-32, caractères a-z 0-9 '-', sans
     *      tiret en début / fin et pas de double tiret.
     */
    function _validateName(string calldata name) internal pure {
        bytes calldata b = bytes(name);
        uint256 len = b.length;
        if (len < MIN_LENGTH || len > MAX_LENGTH) revert InvalidName();
        if (b[0] == 0x2d || b[len - 1] == 0x2d) revert InvalidName();

        bool prevHyphen = false;
        for (uint256 i = 0; i < len; ++i) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7a);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2d);
            if (!isLower && !isDigit && !isHyphen) revert InvalidName();
            if (isHyphen && prevHyphen) revert InvalidName();
            prevHyphen = isHyphen;
        }
    }
}
