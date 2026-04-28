// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVerifiableAsset}      from "../verification/VerificationRegistry.sol";

/**
 * @title  AppRegistry
 * @author WINTG Team
 * @notice Registre des dApps construites sur WINTG. Inscription publique
 *         50 WTG (gratuit team), modération multisig.
 *
 *         Chaque dApp expose :
 *           - nom, description, URL
 *           - manifest URI (IPFS pointer vers le JSON PWA-style)
 *           - catégorie (defi/gaming/social/payment/utility)
 *           - contrats liés (jusqu'à 10 adresses)
 *           - createur (msg.sender)
 *           - verificationTier (None / FactoryCreated / Verified / Official)
 *
 *         Verification flow identique aux tokens :
 *           - 500 WTG pour passer en WintgVerified
 *           - VerificationAdmin valide
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, NatSpec.
 */
contract AppRegistry is Ownable2Step, ReentrancyGuard {
    uint256 public constant TREASURY_BPS = 7000;
    uint256 public constant ADMIN_BPS    = 2000;
    uint256 public constant BURN_BPS     = 1000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant MAX_CONTRACTS = 10;

    uint256 public registrationFee = 50 ether;
    address public treasury;
    address public verificationAdmin;

    mapping(address => bool) public isTeamMember;

    enum Tier { None, FactoryCreated, WintgVerified, WintgOfficial }
    enum Status { None, Pending, Verified, Rejected }

    struct App {
        address   creator;
        string    name;
        string    description;
        string    url;
        string    manifestURI;
        string    category;
        address[] contracts;
        Tier      tier;
        Status    verifStatus;
        uint64    createdAt;
        uint64    requestedAt;
        uint256   paidVerification;
        bool      flagged;
        string    flagReportURI;
    }

    /// @dev appId = keccak256(creator, name) — globally unique.
    mapping(bytes32 => App) public apps;
    bytes32[] public appList;
    mapping(address => bytes32[]) public appsByCreator;

    event AppRegistered(bytes32 indexed appId, address indexed creator, string name, string manifestURI);
    event AppUpdated(bytes32 indexed appId);
    event AppFlagged(bytes32 indexed appId, string reportURI);
    event AppUnflagged(bytes32 indexed appId);

    event VerificationRequested(bytes32 indexed appId, uint256 paid);
    event VerificationApproved(bytes32 indexed appId);
    event VerificationRejected(bytes32 indexed appId, string reason, uint256 refunded);
    event TierRevoked(bytes32 indexed appId, string reason);

    event TeamMemberAdded(address indexed member);
    event TeamMemberRemoved(address indexed member);
    event TreasuryChanged(address indexed previous, address indexed current);
    event VerificationAdminChanged(address indexed previous, address indexed current);

    error InvalidParams();
    error WrongFee(uint256 sent, uint256 expected);
    error AppExists();
    error AppNotFound();
    error NotCreator();
    error NotAdmin();
    error AlreadyPending();
    error NotPending();
    error InvalidIPFS();
    error TooManyContracts();
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury, address initialAdmin) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidParams();
        treasury = initialTreasury;
        verificationAdmin = initialAdmin;
        emit TreasuryChanged(address(0), initialTreasury);
        emit VerificationAdminChanged(address(0), initialAdmin);
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    function register(
        string calldata name,
        string calldata description,
        string calldata url,
        string calldata manifestURI,
        string calldata category,
        address[] calldata contracts_
    ) external payable nonReentrant returns (bytes32 appId) {
        if (bytes(name).length == 0 || bytes(name).length > 64) revert InvalidParams();
        if (bytes(manifestURI).length < 7) revert InvalidIPFS();
        if (contracts_.length > MAX_CONTRACTS) revert TooManyContracts();
        bool free = isTeamMember[msg.sender];
        uint256 expectedFee = free ? 0 : registrationFee;
        if (msg.value != expectedFee) revert WrongFee(msg.value, expectedFee);

        appId = keccak256(abi.encode(msg.sender, name));
        if (apps[appId].creator != address(0)) revert AppExists();

        apps[appId] = App({
            creator: msg.sender,
            name: name,
            description: description,
            url: url,
            manifestURI: manifestURI,
            category: category,
            contracts: contracts_,
            tier: Tier.FactoryCreated,
            verifStatus: Status.None,
            createdAt: uint64(block.timestamp),
            requestedAt: 0,
            paidVerification: 0,
            flagged: false,
            flagReportURI: ""
        });
        appList.push(appId);
        appsByCreator[msg.sender].push(appId);

        if (msg.value > 0) _distributeFee(msg.value);

        emit AppRegistered(appId, msg.sender, name, manifestURI);
    }

    function update(
        bytes32 appId,
        string calldata description,
        string calldata url,
        string calldata manifestURI,
        string calldata category,
        address[] calldata contracts_
    ) external {
        App storage a = apps[appId];
        if (a.creator == address(0)) revert AppNotFound();
        if (a.creator != msg.sender) revert NotCreator();
        if (bytes(manifestURI).length < 7) revert InvalidIPFS();
        if (contracts_.length > MAX_CONTRACTS) revert TooManyContracts();
        a.description = description;
        a.url = url;
        a.manifestURI = manifestURI;
        a.category = category;
        a.contracts = contracts_;
        emit AppUpdated(appId);
    }

    // -------------------------------------------------------------------------
    // Verification (tier 2 — WintgVerified)
    // -------------------------------------------------------------------------

    function requestVerification(bytes32 appId) external payable nonReentrant {
        App storage a = apps[appId];
        if (a.creator == address(0)) revert AppNotFound();
        if (a.creator != msg.sender) revert NotCreator();
        if (msg.value != 500 ether) revert WrongFee(msg.value, 500 ether);
        if (a.verifStatus == Status.Pending) revert AlreadyPending();
        a.verifStatus = Status.Pending;
        a.requestedAt = uint64(block.timestamp);
        a.paidVerification = msg.value;
        emit VerificationRequested(appId, msg.value);
    }

    function approveVerification(bytes32 appId) external nonReentrant {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        App storage a = apps[appId];
        if (a.verifStatus != Status.Pending) revert NotPending();
        uint256 paid = a.paidVerification;
        a.paidVerification = 0;
        a.verifStatus = Status.Verified;
        a.tier = Tier.WintgVerified;

        uint256 toTreasury = (paid * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (paid * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = paid - toTreasury - toAdmin;
        _safeSend(payable(treasury), toTreasury);
        _safeSend(payable(verificationAdmin), toAdmin);
        _safeSend(payable(BURN_ADDRESS), toBurn);

        emit VerificationApproved(appId);
    }

    function rejectVerification(bytes32 appId, string calldata reason, string calldata reportURI) external nonReentrant {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        if (bytes(reportURI).length < 7) revert InvalidIPFS();
        App storage a = apps[appId];
        if (a.verifStatus != Status.Pending) revert NotPending();
        uint256 paid = a.paidVerification;
        a.paidVerification = 0;
        a.verifStatus = Status.Rejected;

        uint256 refund = (paid * 5000) / 10_000; // 50 % refund
        uint256 toTreasury = paid - refund;
        _safeSend(payable(a.creator), refund);
        _safeSend(payable(treasury), toTreasury);

        emit VerificationRejected(appId, reason, refund);
    }

    function revokeTier(bytes32 appId, string calldata reason, string calldata reportURI) external {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        if (bytes(reportURI).length < 7) revert InvalidIPFS();
        apps[appId].tier = Tier.FactoryCreated;
        emit TierRevoked(appId, reason);
    }

    function setOfficial(bytes32 appId) external onlyOwner {
        apps[appId].tier = Tier.WintgOfficial;
    }

    // -------------------------------------------------------------------------
    // Moderation — flag / unflag
    // -------------------------------------------------------------------------

    function flag(bytes32 appId, string calldata reportURI) external {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        if (bytes(reportURI).length < 7) revert InvalidIPFS();
        apps[appId].flagged = true;
        apps[appId].flagReportURI = reportURI;
        emit AppFlagged(appId, reportURI);
    }

    function unflag(bytes32 appId) external {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        apps[appId].flagged = false;
        delete apps[appId].flagReportURI;
        emit AppUnflagged(appId);
    }

    // -------------------------------------------------------------------------
    // Owner — admin
    // -------------------------------------------------------------------------

    function addTeamMember(address m) external onlyOwner { isTeamMember[m] = true; emit TeamMemberAdded(m); }
    function removeTeamMember(address m) external onlyOwner { isTeamMember[m] = false; emit TeamMemberRemoved(m); }

    function setRegistrationFee(uint256 newFee) external onlyOwner { registrationFee = newFee; }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }
    function setVerificationAdmin(address newAdmin) external onlyOwner {
        address previous = verificationAdmin;
        verificationAdmin = newAdmin;
        emit VerificationAdminChanged(previous, newAdmin);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function appsCount() external view returns (uint256) { return appList.length; }
    function appsByCreatorCount(address c) external view returns (uint256) { return appsByCreator[c].length; }

    function appsSlice(uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        uint256 total = appList.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = appList[i];
    }

    function appContractsOf(bytes32 appId) external view returns (address[] memory) {
        return apps[appId].contracts;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _distributeFee(uint256 amount) internal {
        uint256 toTreasury = (amount * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (amount * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = amount - toTreasury - toAdmin;
        _safeSend(payable(treasury),          toTreasury);
        _safeSend(payable(verificationAdmin), toAdmin);
        _safeSend(payable(BURN_ADDRESS),      toBurn);
    }

    function _safeSend(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
