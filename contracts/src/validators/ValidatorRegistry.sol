// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title  ValidatorRegistry
 * @author WINTG Team
 * @notice Registry on-chain des validateurs WINTG : leurs métadonnées
 *         (nom, organisation, URL, contact PGP) sont stockées sur-chaîne pour
 *         transparence publique.
 *
 *         La liste autoritative des validateurs reste celle d'IBFT 2.0
 *         (consensus). Ce registry est **descriptif**, pas exécutif :
 *         les block explorers / dApps utilisent ce registry pour afficher
 *         qui exploite le réseau.
 *
 *         L'ownership du registry est transféré au `WINTGTimelock` post-bootstrap
 *         pour que toute modification passe par la DAO.
 */
contract ValidatorRegistry is Ownable2Step {
    struct ValidatorInfo {
        address validatorAddress;   // adresse IBFT (extraData)
        string  name;
        string  organization;
        string  websiteUrl;
        string  contactPgp;         // empreinte PGP pour comm sécurisée
        string  geographicLocation; // ex: "Lomé, Togo"
        uint64  joinedAt;           // timestamp de rejoint
        bool    active;
    }

    mapping(address => ValidatorInfo) public validators;
    address[] public validatorList;
    mapping(address => uint256) private _indexOf;  // 1-based

    event ValidatorAdded(address indexed validator, string name, string organization);
    event ValidatorUpdated(address indexed validator, string name);
    event ValidatorRemoved(address indexed validator);

    error AlreadyRegistered(address v);
    error NotRegistered(address v);
    error EmptyName();

    constructor(address initialOwner_) Ownable(initialOwner_) {}

    function add(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation
    ) external onlyOwner {
        if (validators[validatorAddress].validatorAddress != address(0)) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (bytes(name).length == 0) revert EmptyName();

        validators[validatorAddress] = ValidatorInfo({
            validatorAddress: validatorAddress,
            name: name,
            organization: organization,
            websiteUrl: websiteUrl,
            contactPgp: contactPgp,
            geographicLocation: geographicLocation,
            joinedAt: uint64(block.timestamp),
            active: true
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
        bool active
    ) external onlyOwner {
        ValidatorInfo storage v = validators[validatorAddress];
        if (v.validatorAddress == address(0)) revert NotRegistered(validatorAddress);
        v.name = name;
        v.organization = organization;
        v.websiteUrl = websiteUrl;
        v.contactPgp = contactPgp;
        v.geographicLocation = geographicLocation;
        v.active = active;
        emit ValidatorUpdated(validatorAddress, name);
    }

    function remove(address validatorAddress) external onlyOwner {
        uint256 idx = _indexOf[validatorAddress];
        if (idx == 0) revert NotRegistered(validatorAddress);

        // Swap-and-pop
        uint256 lastIdx = validatorList.length;
        if (idx != lastIdx) {
            address last = validatorList[lastIdx - 1];
            validatorList[idx - 1] = last;
            _indexOf[last] = idx;
        }
        validatorList.pop();
        delete _indexOf[validatorAddress];
        delete validators[validatorAddress];

        emit ValidatorRemoved(validatorAddress);
    }

    function count() external view returns (uint256) {
        return validatorList.length;
    }

    function listAll() external view returns (ValidatorInfo[] memory all) {
        all = new ValidatorInfo[](validatorList.length);
        for (uint256 i = 0; i < validatorList.length; i++) {
            all[i] = validators[validatorList[i]];
        }
    }
}
