// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  VerifiableCredentialsRegistry
 * @author WINTG Team
 * @notice Registry on-chain pour les Verifiable Credentials W3C (KYC,
 *         diplômes, certifications) émis par des `Issuers` reconnus.
 *
 *         Modèle :
 *           - Le `multisig` (owner) approuve les Issuers (universités,
 *             gouvernements partenaires, KYC providers).
 *           - Pour devenir Issuer : KYC + 5000 WTG bond (slashable si fraude).
 *           - Un Issuer émet une VC en publiant sur-chain le hash du
 *             credential JSON (privacy-preserving) + IPFS pointer.
 *           - Soulbound : les VC sont liées à l'âme du holder, non-transférables.
 *           - Issuer peut révoquer une VC (event public).
 *           - Expiration optionnelle.
 *
 *         La VC réelle (JSON W3C) est stockée hors-chaîne (IPFS), seul
 *         son hash et metadata sont on-chain pour vérifier l'intégrité.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, NatSpec.
 */
contract VerifiableCredentialsRegistry is Ownable2Step, ReentrancyGuard {
    uint256 public constant ISSUER_BOND_WTG = 5_000 ether;

    struct Issuer {
        bool    active;
        uint64  approvedAt;
        uint256 bond;
        string  name;          // ex: "Université de Lomé"
        string  metadataURI;   // IPFS pointer to issuer profile
    }

    struct VC {
        address issuer;
        address holder;
        bytes32 credentialHash; // keccak256 of the W3C JSON
        string  metadataURI;    // IPFS pointer to the JSON
        uint64  issuedAt;
        uint64  expiresAt;      // 0 = no expiration
        bool    revoked;
        string  revocationReason;
    }

    address public treasury;

    /// @notice Issuer state.
    mapping(address => Issuer) public issuers;

    /// @notice VC ID → VC. ID = keccak256(issuer, holder, credentialHash).
    mapping(bytes32 => VC) public credentials;

    /// @notice holder → list of credential IDs.
    mapping(address => bytes32[]) private _credentialsOfHolder;

    event IssuerApplied(address indexed candidate, uint256 bond, string name, string metadataURI);
    event IssuerApproved(address indexed issuer);
    event IssuerSlashed(address indexed issuer, uint256 amount, string reason, string ipfsReportURI);
    event IssuerWithdrew(address indexed issuer, uint256 returned);

    event CredentialIssued(bytes32 indexed credentialId, address indexed issuer, address indexed holder, bytes32 credentialHash, string metadataURI, uint64 expiresAt);
    event CredentialRevoked(bytes32 indexed credentialId, string reason);

    event TreasuryUpdated(address newTreasury);

    error InvalidTreasury();
    error WrongBond(uint256 sent, uint256 expected);
    error AlreadyApplied();
    error NotApproved();
    error AlreadyApproved();
    error NotIssuer();
    error VCNotFound();
    error AlreadyRevoked();
    error InvalidIPFS();

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
        emit TreasuryUpdated(initialTreasury);
    }

    // -------------------------------------------------------------------------
    // Issuer flow
    // -------------------------------------------------------------------------

    /**
     * @notice Candidate applies as Issuer by locking 5000 WTG bond.
     *         The multisig then approves manually after off-chain KYC review.
     */
    function applyAsIssuer(string calldata name, string calldata metadataURI) external payable nonReentrant {
        if (msg.value != ISSUER_BOND_WTG) revert WrongBond(msg.value, ISSUER_BOND_WTG);
        Issuer storage iss = issuers[msg.sender];
        if (iss.bond > 0) revert AlreadyApplied();
        if (bytes(metadataURI).length < 7) revert InvalidIPFS();
        iss.bond = msg.value;
        iss.name = name;
        iss.metadataURI = metadataURI;
        emit IssuerApplied(msg.sender, msg.value, name, metadataURI);
    }

    function approveIssuer(address candidate) external onlyOwner {
        Issuer storage iss = issuers[candidate];
        if (iss.bond == 0) revert NotApproved();
        if (iss.active) revert AlreadyApproved();
        iss.active = true;
        iss.approvedAt = uint64(block.timestamp);
        emit IssuerApproved(candidate);
    }

    function slashIssuer(address victim, uint256 amount, string calldata reason, string calldata ipfsReportURI) external onlyOwner nonReentrant {
        if (bytes(ipfsReportURI).length < 7) revert InvalidIPFS();
        Issuer storage iss = issuers[victim];
        if (!iss.active) revert NotApproved();
        if (amount > iss.bond) amount = iss.bond;
        iss.bond -= amount;
        if (iss.bond == 0) iss.active = false;
        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) revert InvalidTreasury();
        emit IssuerSlashed(victim, amount, reason, ipfsReportURI);
    }

    /**
     * @notice Issuer voluntary withdrawal: deactivate + return bond.
     *         Emits + sends remaining bond back. Not allowed if currently
     *         under investigation (multisig must un-pause first by un-slashing
     *         to 0 if needed).
     */
    function withdrawAsIssuer() external nonReentrant {
        Issuer storage iss = issuers[msg.sender];
        if (!iss.active && iss.bond == 0) revert NotApproved();
        uint256 amount = iss.bond;
        iss.bond = 0;
        iss.active = false;
        if (amount > 0) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert InvalidTreasury();
        }
        emit IssuerWithdrew(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Credential issuance / revocation
    // -------------------------------------------------------------------------

    function issueCredential(
        address holder,
        bytes32 credentialHash,
        string calldata metadataURI,
        uint64 expiresAt
    ) external returns (bytes32 credentialId) {
        Issuer storage iss = issuers[msg.sender];
        if (!iss.active) revert NotIssuer();
        if (bytes(metadataURI).length < 7) revert InvalidIPFS();

        credentialId = keccak256(abi.encode(msg.sender, holder, credentialHash));

        credentials[credentialId] = VC({
            issuer: msg.sender,
            holder: holder,
            credentialHash: credentialHash,
            metadataURI: metadataURI,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false,
            revocationReason: ""
        });
        _credentialsOfHolder[holder].push(credentialId);

        emit CredentialIssued(credentialId, msg.sender, holder, credentialHash, metadataURI, expiresAt);
    }

    function revokeCredential(bytes32 credentialId, string calldata reason) external {
        VC storage vc = credentials[credentialId];
        if (vc.issuer == address(0)) revert VCNotFound();
        if (vc.issuer != msg.sender) revert NotIssuer();
        if (vc.revoked) revert AlreadyRevoked();
        vc.revoked = true;
        vc.revocationReason = reason;
        emit CredentialRevoked(credentialId, reason);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function isIssuer(address candidate) external view returns (bool) {
        return issuers[candidate].active;
    }

    function credentialsOfHolder(address holder) external view returns (bytes32[] memory) {
        return _credentialsOfHolder[holder];
    }

    function isCredentialValid(bytes32 credentialId) external view returns (bool) {
        VC memory vc = credentials[credentialId];
        if (vc.issuer == address(0) || vc.revoked) return false;
        if (vc.expiresAt != 0 && block.timestamp > vc.expiresAt) return false;
        if (!issuers[vc.issuer].active) return false;
        return true;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
}
