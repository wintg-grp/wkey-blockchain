// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  ValidatorRegistry
 * @author WINTG Team
 * @notice Registre on-chain des validateurs WINTG. Sert deux objectifs :
 *
 *           1. **Candidatures publiques** : n'importe qui peut postuler en
 *              déposant un bond en WTG natif (`applyAsValidator`). Le bond
 *              est conservé tant que la candidature est pending et restitué
 *              en cas de rejet.
 *
 *           2. **Annuaire des validateurs actifs** : métadonnées (nom, organisation,
 *              site, PGP, localisation, enode) consultables par les block explorers
 *              et les dApps.
 *
 *         Pipeline :
 *           postuler   → applyAsValidator()  : status = Pending
 *           approuver  → approveCandidate()  : status = Approved
 *                        l'admin appelle ensuite ibft_proposeValidatorVote(true, addr)
 *                        sur les nœuds Besu pour l'ajouter au consensus IBFT 2.0
 *           rejeter    → rejectCandidate()   : bond rendu, status = Rejected
 *           retirer    → removeValidator()   : ex-validateur sortant
 *
 *         L'ownership est destiné à être transféré à un `WINTGMultisig` /
 *         `Timelock` après le bootstrap pour décentraliser la gouvernance.
 */
contract ValidatorRegistry is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    enum Status { Unknown, Pending, Approved, Rejected, Removed }

    struct ValidatorInfo {
        address validatorAddress;   // adresse IBFT (extraData)
        string  name;
        string  organization;
        string  websiteUrl;
        string  contactPgp;         // empreinte PGP pour comm sécurisée
        string  geographicLocation; // ex: "Lomé, Togo"
        string  enodeUrl;           // enode://<pubkey>@<ip>:30303
        uint256 bondAmount;         // WTG bloqués pour la candidature
        uint64  joinedAt;           // timestamp de rejoint (= approbation)
        Status  status;
    }

    /// @notice Bond minimum exigé pour postuler comme validateur.
    /// Modifiable par l'admin/DAO via `setMinBond`.
    uint256 public minBond;

    mapping(address => ValidatorInfo) public validators;
    address[] public validatorList;
    mapping(address => uint256) private _indexOf;  // 1-based

    address[] public candidateList;
    mapping(address => uint256) private _candidateIndex;  // 1-based

    event Applied(address indexed candidate, string name, uint256 bond);
    event Approved(address indexed validator, string name);
    event Rejected(address indexed candidate, uint256 bondReturned);
    event ValidatorAdded(address indexed validator, string name, string organization);
    event ValidatorUpdated(address indexed validator, string name);
    event ValidatorRemoved(address indexed validator);
    event MinBondChanged(uint256 oldBond, uint256 newBond);

    error AlreadyRegistered(address v);
    error NotRegistered(address v);
    error NotPending(address v);
    error EmptyName();
    error InsufficientBond(uint256 sent, uint256 required);
    error NothingToRefund();

    constructor(address initialOwner_, uint256 minBond_) Ownable(initialOwner_) {
        minBond = minBond_;
        emit MinBondChanged(0, minBond_);
    }

    // ----- Candidacy flow ----------------------------------------------------

    /// @notice Postuler comme validateur. Le bond doit être ≥ `minBond` en WTG natif.
    /// L'adresse IBFT (validatorAddress) doit correspondre à la clé du nœud Besu.
    function applyAsValidator(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation,
        string calldata enodeUrl
    ) external payable {
        if (validators[validatorAddress].status == Status.Approved) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (validators[validatorAddress].status == Status.Pending) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (msg.value < minBond) revert InsufficientBond(msg.value, minBond);
        if (bytes(name).length == 0) revert EmptyName();

        validators[validatorAddress] = ValidatorInfo({
            validatorAddress:   validatorAddress,
            name:               name,
            organization:       organization,
            websiteUrl:         websiteUrl,
            contactPgp:         contactPgp,
            geographicLocation: geographicLocation,
            enodeUrl:           enodeUrl,
            bondAmount:         msg.value,
            joinedAt:           0,
            status:             Status.Pending
        });
        candidateList.push(validatorAddress);
        _candidateIndex[validatorAddress] = candidateList.length;

        emit Applied(validatorAddress, name, msg.value);
    }

    /// @notice L'admin approuve une candidature et la fait passer en Approved.
    /// Étape suivante hors-chaîne : `ibft_proposeValidatorVote(true, addr)` sur
    /// chaque nœud existant pour l'ajouter au consensus.
    function approveCandidate(address candidate) external onlyOwner {
        ValidatorInfo storage v = validators[candidate];
        if (v.status != Status.Pending) revert NotPending(candidate);

        v.status = Status.Approved;
        v.joinedAt = uint64(block.timestamp);

        _removeFromCandidates(candidate);

        validatorList.push(candidate);
        _indexOf[candidate] = validatorList.length;

        emit Approved(candidate, v.name);
        emit ValidatorAdded(candidate, v.name, v.organization);
    }

    /// @notice Rejette une candidature et restitue le bond.
    function rejectCandidate(address candidate) external onlyOwner nonReentrant {
        ValidatorInfo storage v = validators[candidate];
        if (v.status != Status.Pending) revert NotPending(candidate);

        uint256 bond = v.bondAmount;
        v.bondAmount = 0;
        v.status = Status.Rejected;

        _removeFromCandidates(candidate);

        if (bond > 0) {
            payable(candidate).sendValue(bond);
        }
        emit Rejected(candidate, bond);
    }

    function _removeFromCandidates(address candidate) internal {
        uint256 idx = _candidateIndex[candidate];
        if (idx == 0) return;
        uint256 lastIdx = candidateList.length;
        if (idx != lastIdx) {
            address last = candidateList[lastIdx - 1];
            candidateList[idx - 1] = last;
            _candidateIndex[last] = idx;
        }
        candidateList.pop();
        delete _candidateIndex[candidate];
    }

    function setMinBond(uint256 newMinBond) external onlyOwner {
        emit MinBondChanged(minBond, newMinBond);
        minBond = newMinBond;
    }

    // ----- Admin-only (bootstrap & corrections) ------------------------------

    /// @notice Inscrit directement un validateur sans passer par la candidature.
    /// Réservé au bootstrap (validateurs initiaux) et aux corrections de gouvernance.
    function add(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation,
        string calldata enodeUrl
    ) external onlyOwner {
        if (validators[validatorAddress].status == Status.Approved) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (validators[validatorAddress].status == Status.Pending) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (bytes(name).length == 0) revert EmptyName();

        validators[validatorAddress] = ValidatorInfo({
            validatorAddress:   validatorAddress,
            name:               name,
            organization:       organization,
            websiteUrl:         websiteUrl,
            contactPgp:         contactPgp,
            geographicLocation: geographicLocation,
            enodeUrl:           enodeUrl,
            bondAmount:         0,
            joinedAt:           uint64(block.timestamp),
            status:             Status.Approved
        });
        validatorList.push(validatorAddress);
        _indexOf[validatorAddress] = validatorList.length;

        emit ValidatorAdded(validatorAddress, name, organization);
    }

    function update(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation,
        string calldata enodeUrl
    ) external onlyOwner {
        ValidatorInfo storage v = validators[validatorAddress];
        if (v.status != Status.Approved) revert NotRegistered(validatorAddress);
        v.name = name;
        v.organization = organization;
        v.websiteUrl = websiteUrl;
        v.contactPgp = contactPgp;
        v.geographicLocation = geographicLocation;
        v.enodeUrl = enodeUrl;
        emit ValidatorUpdated(validatorAddress, name);
    }

    /// @notice Retire un validateur du registre. Restitue son bond s'il en a un.
    /// L'admin doit aussi appeler `ibft_proposeValidatorVote(false, addr)` hors-chaîne.
    function remove(address validatorAddress) external onlyOwner nonReentrant {
        uint256 idx = _indexOf[validatorAddress];
        if (idx == 0) revert NotRegistered(validatorAddress);

        ValidatorInfo storage v = validators[validatorAddress];
        uint256 bond = v.bondAmount;

        // Swap-and-pop
        uint256 lastIdx = validatorList.length;
        if (idx != lastIdx) {
            address last = validatorList[lastIdx - 1];
            validatorList[idx - 1] = last;
            _indexOf[last] = idx;
        }
        validatorList.pop();
        delete _indexOf[validatorAddress];

        v.bondAmount = 0;
        v.status = Status.Removed;

        if (bond > 0) {
            payable(validatorAddress).sendValue(bond);
        }
        emit ValidatorRemoved(validatorAddress);
    }

    // ----- Views -------------------------------------------------------------

    function count() external view returns (uint256) {
        return validatorList.length;
    }

    function candidateCount() external view returns (uint256) {
        return candidateList.length;
    }

    function listAll() external view returns (ValidatorInfo[] memory all) {
        all = new ValidatorInfo[](validatorList.length);
        for (uint256 i = 0; i < validatorList.length; i++) {
            all[i] = validators[validatorList[i]];
        }
    }

    function listCandidates() external view returns (ValidatorInfo[] memory all) {
        all = new ValidatorInfo[](candidateList.length);
        for (uint256 i = 0; i < candidateList.length; i++) {
            all[i] = validators[candidateList[i]];
        }
    }
}
