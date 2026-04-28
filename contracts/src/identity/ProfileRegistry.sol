// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/**
 * @title  ProfileRegistry
 * @author WINTG Team
 * @notice Registry on-chain qui lie une adresse à un profil public
 *         (avatar, bio, e-mail, sociaux). Lecture/écriture libre par
 *         le owner de l'adresse, gratuit (gas only).
 *
 *         Profils standardisés : `avatar`, `bio`, `email`, `twitter`,
 *         `github`, `telegram`, `website`. Plus une mappe `extra`
 *         libre (key/value) pour les champs custom.
 *
 *         Modération : pas de suppression centralisée (le user contrôle
 *         son profil), mais le multisig peut **flag** un profil abusif
 *         pour signaler aux dApps de l'afficher avec un warning.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, NatSpec.
 *         Tous les champs sont des chaînes courtes (≤ 256 chars).
 */
contract ProfileRegistry {
    uint256 public constant MAX_FIELD_LENGTH = 256;
    uint256 public constant MAX_BIO_LENGTH   = 512;

    struct Profile {
        string avatar;
        string bio;
        string email;
        string twitter;
        string github;
        string telegram;
        string website;
        bool   exists;
    }

    /// @notice address → profil principal
    mapping(address => Profile) private _profiles;

    /// @notice champs custom : address → key → value
    mapping(address => mapping(string => string)) private _extra;

    /// @notice flag de modération : address → ipfs report URI (vide = pas flagué)
    mapping(address => string) public flagged;

    /// @notice multisig autorisé à flag/unflag
    address public moderator;

    event ProfileUpdated(address indexed account);
    event ProfileExtraUpdated(address indexed account, string key);
    event ProfileFlagged(address indexed account, string ipfsReportURI);
    event ProfileUnflagged(address indexed account);
    event ModeratorChanged(address indexed previous, address indexed current);

    error FieldTooLong();
    error InvalidModerator();
    error NotModerator();

    constructor(address initialModerator) {
        if (initialModerator == address(0)) revert InvalidModerator();
        moderator = initialModerator;
        emit ModeratorChanged(address(0), initialModerator);
    }

    // -------------------------------------------------------------------------
    // Profile mutation (called by user)
    // -------------------------------------------------------------------------

    function setProfile(
        string calldata avatar,
        string calldata bio,
        string calldata email,
        string calldata twitter,
        string calldata github,
        string calldata telegram,
        string calldata website
    ) external {
        _check(avatar);
        _checkBio(bio);
        _check(email);
        _check(twitter);
        _check(github);
        _check(telegram);
        _check(website);
        _profiles[msg.sender] = Profile({
            avatar: avatar, bio: bio, email: email,
            twitter: twitter, github: github, telegram: telegram, website: website,
            exists: true
        });
        emit ProfileUpdated(msg.sender);
    }

    function setAvatar(string calldata avatar) external {
        _check(avatar);
        _profiles[msg.sender].avatar = avatar;
        _profiles[msg.sender].exists = true;
        emit ProfileUpdated(msg.sender);
    }

    function setExtra(string calldata key, string calldata value) external {
        _check(key);
        _check(value);
        _extra[msg.sender][key] = value;
        emit ProfileExtraUpdated(msg.sender, key);
    }

    function clearProfile() external {
        delete _profiles[msg.sender];
        emit ProfileUpdated(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function profileOf(address account) external view returns (Profile memory) {
        return _profiles[account];
    }

    function extraOf(address account, string calldata key) external view returns (string memory) {
        return _extra[account][key];
    }

    // -------------------------------------------------------------------------
    // Moderation (multisig only)
    // -------------------------------------------------------------------------

    function flag(address account, string calldata ipfsReportURI) external {
        if (msg.sender != moderator) revert NotModerator();
        flagged[account] = ipfsReportURI;
        emit ProfileFlagged(account, ipfsReportURI);
    }

    function unflag(address account) external {
        if (msg.sender != moderator) revert NotModerator();
        delete flagged[account];
        emit ProfileUnflagged(account);
    }

    function setModerator(address newModerator) external {
        if (msg.sender != moderator) revert NotModerator();
        if (newModerator == address(0)) revert InvalidModerator();
        address previous = moderator;
        moderator = newModerator;
        emit ModeratorChanged(previous, newModerator);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _check(string calldata s) internal pure {
        if (bytes(s).length > MAX_FIELD_LENGTH) revert FieldTooLong();
    }

    function _checkBio(string calldata s) internal pure {
        if (bytes(s).length > MAX_BIO_LENGTH) revert FieldTooLong();
    }
}
