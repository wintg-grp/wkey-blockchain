// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  IVerifiableAsset
 * @notice Interface qu'un token / NFT collection / dApp doit implémenter
 *         pour que le `VerificationRegistry` puisse écrire le tier dans
 *         leur stockage. Tous les contrats créés via les factories WINTG
 *         exposent cette interface.
 */
interface IVerifiableAsset {
    enum Tier {
        None,
        FactoryCreated,
        WintgVerified,
        WintgOfficial
    }

    /// @notice Met à jour le tier de cet asset. Seul le VerificationRegistry
    ///         configuré peut appeler cette fonction.
    function setVerificationTier(Tier newTier) external;
}

/**
 * @title  VerificationRegistry
 * @author WINTG Team
 * @notice Hub central qui gère les badges or des tokens / NFT / dApps
 *         WINTG. Tous les assets créés via les factories WINTG sont
 *         "FactoryCreated" (tier 1, badge bleu) automatiquement. Pour
 *         passer "WintgVerified" (tier 2, badge or), un créateur paie 500
 *         WTG, un audit est fait, et le `VerificationAdmin` valide.
 *
 *         Workflow d'un token :
 *           1. Créateur appelle `requestVerification(asset)` + envoie 500 WTG
 *           2. État : Pending
 *           3a. Admin appelle `approveVerification(asset)` → tier devient
 *               WintgVerified, paiement réparti 70/20/10
 *           3b. Admin appelle `rejectVerification(asset, reason, ipfsURI)`
 *               → 50 % refund au créateur, 50 % au treasury
 *           3c. Si > 14 jours sans décision → créateur peut appeler
 *               `claimRefundIfStale(asset)` → 100 % refund
 *
 *         Le tier 3 (WintgOfficial) est posé exclusivement par le multisig
 *         (gratuit, hors queue) pour les tokens WINTG officiels (WTG,
 *         WWTG, WKEY, USDW, WCFA).
 *
 *         Une révocation publique est possible : `revokeVerification` —
 *         l'admin peut rétrograder un asset vers None avec un event public
 *         et un IPFS report obligatoire (transparence).
 *
 * @dev    Conformes aux règles WINTG : Apache-2.0, OZ v5, Ownable2Step,
 *         ReentrancyGuard, NatSpec.
 */
contract VerificationRegistry is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Frais de demande de vérification (badge or). En WTG natif.
    uint256 public constant VERIFICATION_FEE = 500 ether;

    /// @notice Délai au-delà duquel un demandeur peut réclamer un refund 100 %.
    uint256 public constant SLA_SECONDS = 14 days;

    /// @notice Distribution du paiement d'audit (en basis points, 10000 = 100 %).
    uint256 public constant TREASURY_BPS = 7000; // 70 %
    uint256 public constant ADMIN_BPS = 2000; // 20 %
    uint256 public constant BURN_BPS = 1000; // 10 %

    /// @notice Pourcentage du fee remboursé en cas de rejet (50 %).
    uint256 public constant REJECT_REFUND_BPS = 5000;

    /// @notice Adresse de burn (les WTG envoyés ici sont définitivement
    ///         retirés de la circulation).
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    enum Status {
        None,
        Pending,
        Verified,
        Rejected
    }

    struct Request {
        address requester;
        uint64 requestedAt;
        Status status;
        uint256 paid; // montant escrowé en attente de décision
    }

    /// @notice Une requête par asset (token / NFT collection / dApp).
    mapping(address => Request) public requests;

    /// @notice Compte délégué qui peut promouvoir au tier 2 et révoquer.
    address public verificationAdmin;

    /// @notice Trésorerie où vont les frais d'audit (multisig WINTG).
    address public treasury;

    /// @notice Compte autorisé par les factories WINTG pour marquer leurs
    ///         tokens en `FactoryCreated` (tier 1) sans frais.
    mapping(address => bool) public isAuthorizedFactory;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event VerificationRequested(address indexed asset, address indexed requester, uint256 paid);

    event VerificationApproved(address indexed asset, address indexed approver, uint256 toTreasury, uint256 toAdmin, uint256 toBurn);

    event VerificationRejected(address indexed asset, address indexed rejecter, string reason, string ipfsReportURI, uint256 refunded);

    event VerificationRevoked(address indexed asset, address indexed revoker, string reason, string ipfsReportURI);

    event StaleRefundClaimed(address indexed asset, address indexed requester, uint256 amount);

    event OfficialTierSet(address indexed asset);

    event VerificationAdminChanged(address indexed previous, address indexed current);

    event TreasuryChanged(address indexed previous, address indexed current);

    event FactoryAuthorized(address indexed factory, bool authorized);

    event FactoryTierMarked(address indexed asset, address indexed factory);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidAddress();
    error WrongFee(uint256 sent, uint256 expected);
    error AlreadyPending();
    error NotPending();
    error NotRequester();
    error SLANotElapsed(uint256 readyAt);
    error NotAdmin();
    error NotAuthorizedFactory();
    error TransferFailed();
    error InvalidIPFSReport();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != verificationAdmin && msg.sender != owner()) revert NotAdmin();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialAdmin, address initialTreasury) Ownable(initialOwner) {
        if (initialAdmin == address(0) || initialTreasury == address(0)) revert InvalidAddress();
        verificationAdmin = initialAdmin;
        treasury = initialTreasury;
        emit VerificationAdminChanged(address(0), initialAdmin);
        emit TreasuryChanged(address(0), initialTreasury);
    }

    // -------------------------------------------------------------------------
    // External — verification request flow
    // -------------------------------------------------------------------------

    /**
     * @notice Demande la vérification d'un asset (token, NFT collection,
     *         dApp). Le caller doit être le owner / créateur de l'asset
     *         (pas vérifié on-chain — c'est lui qui paie). 500 WTG escrowés.
     */
    function requestVerification(address asset) external payable nonReentrant {
        if (asset == address(0)) revert InvalidAddress();
        if (msg.value != VERIFICATION_FEE) revert WrongFee(msg.value, VERIFICATION_FEE);
        Request storage r = requests[asset];
        if (r.status == Status.Pending) revert AlreadyPending();

        r.requester = msg.sender;
        r.requestedAt = uint64(block.timestamp);
        r.status = Status.Pending;
        r.paid = msg.value;

        emit VerificationRequested(asset, msg.sender, msg.value);
    }

    /**
     * @notice L'admin valide un asset. Le tier passe à WintgVerified, le
     *         paiement est réparti 70/20/10.
     */
    function approveVerification(address asset) external onlyAdmin nonReentrant {
        Request storage r = requests[asset];
        if (r.status != Status.Pending) revert NotPending();

        uint256 paid = r.paid;
        r.paid = 0;
        r.status = Status.Verified;

        uint256 toTreasury = (paid * TREASURY_BPS) / 10_000;
        uint256 toAdmin = (paid * ADMIN_BPS) / 10_000;
        uint256 toBurn = paid - toTreasury - toAdmin;

        _safeSend(payable(treasury), toTreasury);
        _safeSend(payable(verificationAdmin), toAdmin);
        _safeSend(payable(BURN_ADDRESS), toBurn);

        IVerifiableAsset(asset).setVerificationTier(IVerifiableAsset.Tier.WintgVerified);

        emit VerificationApproved(asset, msg.sender, toTreasury, toAdmin, toBurn);
    }

    /**
     * @notice L'admin rejette un asset. 50 % refund au créateur, 50 % au treasury.
     *         Un IPFS report d'au moins 7 chars est obligatoire pour la
     *         transparence (lien vers le PDF d'explication).
     */
    function rejectVerification(address asset, string calldata reason, string calldata ipfsReportURI) external onlyAdmin nonReentrant {
        if (bytes(ipfsReportURI).length < 7) revert InvalidIPFSReport();
        Request storage r = requests[asset];
        if (r.status != Status.Pending) revert NotPending();

        uint256 paid = r.paid;
        r.paid = 0;
        r.status = Status.Rejected;

        uint256 refund = (paid * REJECT_REFUND_BPS) / 10_000;
        uint256 toTreasury = paid - refund;

        _safeSend(payable(r.requester), refund);
        _safeSend(payable(treasury), toTreasury);

        emit VerificationRejected(asset, msg.sender, reason, ipfsReportURI, refund);
    }

    /**
     * @notice Le créateur peut récupérer 100 % de son fee si l'admin n'a pas
     *         décidé dans les 14 jours suivant la demande.
     */
    function claimRefundIfStale(address asset) external nonReentrant {
        Request storage r = requests[asset];
        if (r.status != Status.Pending) revert NotPending();
        if (msg.sender != r.requester) revert NotRequester();
        uint256 readyAt = r.requestedAt + SLA_SECONDS;
        if (block.timestamp < readyAt) revert SLANotElapsed(readyAt);

        uint256 paid = r.paid;
        r.paid = 0;
        r.status = Status.None; // ré-éligible à demander

        _safeSend(payable(r.requester), paid);

        emit StaleRefundClaimed(asset, r.requester, paid);
    }

    /**
     * @notice Révoque un badge (downgrade vers None). IPFS report obligatoire
     *         pour transparence publique.
     */
    function revokeVerification(address asset, string calldata reason, string calldata ipfsReportURI) external onlyAdmin {
        if (bytes(ipfsReportURI).length < 7) revert InvalidIPFSReport();
        IVerifiableAsset(asset).setVerificationTier(IVerifiableAsset.Tier.None);
        emit VerificationRevoked(asset, msg.sender, reason, ipfsReportURI);
    }

    // -------------------------------------------------------------------------
    // Factory authorization (tier 1 — FactoryCreated)
    // -------------------------------------------------------------------------

    /**
     * @notice Autorise / révoque une factory à marquer ses créations en
     *         tier 1 (badge bleu).
     */
    function setFactoryAuthorized(address factory, bool authorized) external onlyOwner {
        if (factory == address(0)) revert InvalidAddress();
        isAuthorizedFactory[factory] = authorized;
        emit FactoryAuthorized(factory, authorized);
    }

    /**
     * @notice Appelé par une factory autorisée juste après la création d'un
     *         asset. Pose le tier 1 (FactoryCreated).
     */
    function markFactoryCreated(address asset) external {
        if (!isAuthorizedFactory[msg.sender]) revert NotAuthorizedFactory();
        IVerifiableAsset(asset).setVerificationTier(IVerifiableAsset.Tier.FactoryCreated);
        emit FactoryTierMarked(asset, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Owner — official tier 3
    // -------------------------------------------------------------------------

    /**
     * @notice Marque un asset en tier 3 (WintgOfficial). Réservé au multisig.
     *         Gratuit. Pour WTG, WWTG, WKEY, USDW, WCFA et autres assets
     *         officiels WINTG.
     */
    function setOfficial(address asset) external onlyOwner {
        IVerifiableAsset(asset).setVerificationTier(IVerifiableAsset.Tier.WintgOfficial);
        emit OfficialTierSet(asset);
    }

    /// @notice Bulk version for genesis deployment.
    function setOfficialBatch(address[] calldata assets) external onlyOwner {
        for (uint256 i; i < assets.length; ++i) {
            IVerifiableAsset(assets[i]).setVerificationTier(IVerifiableAsset.Tier.WintgOfficial);
            emit OfficialTierSet(assets[i]);
        }
    }

    // -------------------------------------------------------------------------
    // Admin / Treasury management
    // -------------------------------------------------------------------------

    function setVerificationAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert InvalidAddress();
        address previous = verificationAdmin;
        verificationAdmin = newAdmin;
        emit VerificationAdminChanged(previous, newAdmin);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Envoi WTG natif avec gestion d'erreur.
    function _safeSend(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
