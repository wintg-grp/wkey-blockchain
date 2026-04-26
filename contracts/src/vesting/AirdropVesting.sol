// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title  AirdropVesting
 * @author WINTG Team
 * @notice Distribution Airdrop & Community (8 % du supply, 80 M WTG).
 *         Schedule par bénéficiaire :
 *           - 30 % débloqué au premier `claim()` (TGE pour ce bénéficiaire)
 *           - 70 % linéaire sur 12 mois après le `start` global
 *
 *         Mécanique :
 *           - L'owner publie un Merkle root des allocations
 *             (leaf = keccak256(abi.encodePacked(account, amount))).
 *           - Chaque bénéficiaire appelle `claim(amount, proof)` une fois
 *             pour s'enregistrer et toucher la portion TGE + le linéaire
 *             vesté à ce moment.
 *           - Les appels suivants utilisent `release()` (sans proof).
 *
 *           Avantage : on n'écrit pas 100 000 lignes en storage à la
 *           publication ; chaque utilisateur paie son propre gas.
 */
contract AirdropVesting is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice 30 % débloqué au TGE individuel (premier claim).
    uint16 public constant TGE_BPS = 3_000;

    /// @notice Vesting linéaire sur 12 mois (365 jours).
    uint64 public constant LINEAR_DURATION = 365 days;

    // -------------------------------------------------------------------------
    // Immutable state
    // -------------------------------------------------------------------------

    /// @notice Racine Merkle des allocations.
    bytes32 public immutable merkleRoot;

    /// @notice Timestamp de début (TGE global). Référence pour le linéaire.
    uint64 public immutable start;

    /// @notice Allocation totale gérée (somme des feuilles Merkle).
    uint256 public immutable totalAllocation;

    // -------------------------------------------------------------------------
    // Mutable state
    // -------------------------------------------------------------------------

    /// @notice Allocation totale par bénéficiaire (set lors du premier `claim`).
    mapping(address => uint256) public allocation;

    /// @notice Cumul libéré par bénéficiaire.
    mapping(address => uint256) public released;

    /// @notice Cumul de toutes les allocations enregistrées (pour stats).
    uint256 public totalRegistered;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Claimed(address indexed account, uint256 allocationAmount, uint256 firstRelease);
    event Released(address indexed account, uint256 amount);
    event FundsReceived(address indexed from, uint256 amount);
    event Recovered(address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroMerkleRoot();
    error ZeroAllocation();
    error AlreadyClaimed();
    error InvalidProof();
    error NotClaimed();
    error NothingToRelease();
    error InsufficientBalance(uint256 required, uint256 available);
    error TransferFailed();
    error WindowNotEnded();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address initialOwner_,
        bytes32 merkleRoot_,
        uint64 start_,
        uint256 totalAllocation_
    ) Ownable(initialOwner_) {
        if (merkleRoot_ == bytes32(0)) revert ZeroMerkleRoot();
        if (totalAllocation_ == 0) revert ZeroAllocation();

        merkleRoot = merkleRoot_;
        start = start_;
        totalAllocation = totalAllocation_;
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Public actions
    // -------------------------------------------------------------------------

    /**
     * @notice Premier appel d'un bénéficiaire : valide la preuve Merkle,
     *         enregistre son allocation, et libère immédiatement la portion
     *         TGE + linéaire déjà vestée.
     * @param  amount Montant total alloué à `msg.sender`.
     * @param  proof  Preuve Merkle pour la feuille `(msg.sender, amount)`.
     */
    function claim(uint256 amount, bytes32[] calldata proof) external nonReentrant whenNotPaused {
        if (allocation[msg.sender] != 0) revert AlreadyClaimed();
        if (amount == 0) revert ZeroAllocation();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert InvalidProof();

        allocation[msg.sender] = amount;
        totalRegistered += amount;

        uint256 releasable = _releasableForAmount(amount, 0);
        released[msg.sender] = releasable;

        emit Claimed(msg.sender, amount, releasable);

        if (releasable > 0) {
            uint256 balance = address(this).balance;
            if (balance < releasable) revert InsufficientBalance(releasable, balance);
            payable(msg.sender).sendValue(releasable);
        }
    }

    /**
     * @notice Libère le montant vesté supplémentaire pour `msg.sender`.
     *         À appeler après `claim()` aux jalons souhaités.
     */
    function release() external nonReentrant whenNotPaused {
        uint256 alloc = allocation[msg.sender];
        if (alloc == 0) revert NotClaimed();

        uint256 alreadyReleased = released[msg.sender];
        uint256 amount = _releasableForAmount(alloc, alreadyReleased);
        if (amount == 0) revert NothingToRelease();

        released[msg.sender] = alreadyReleased + amount;
        emit Released(msg.sender, amount);

        uint256 balance = address(this).balance;
        if (balance < amount) revert InsufficientBalance(amount, balance);
        payable(msg.sender).sendValue(amount);
    }

    // -------------------------------------------------------------------------
    // Owner actions
    // -------------------------------------------------------------------------

    /**
     * @notice Récupère le résidu non claimé une fois le linéaire terminé +
     *         12 mois de marge. Évite que des fonds restent piégés
     *         indéfiniment si certains bénéficiaires ne réclament jamais.
     * @param  to Destinataire (typiquement la Trésorerie).
     */
    function recoverUnclaimed(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert TransferFailed();
        // 12 mois de marge après la fin du vesting
        if (uint64(block.timestamp) < start + LINEAR_DURATION + 365 days) {
            revert WindowNotEnded();
        }
        uint256 balance = address(this).balance;
        emit Recovered(to, balance);
        payable(to).sendValue(balance);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Montant cumulé vesté pour `account` à l'instant `block.timestamp`.
    function vestedAmount(address account) external view returns (uint256) {
        uint256 alloc = allocation[account];
        if (alloc == 0) return 0;
        return _vestedFromAmount(alloc);
    }

    /// @notice Montant actuellement libérable pour `account`.
    function getReleasable(address account) external view returns (uint256) {
        uint256 alloc = allocation[account];
        if (alloc == 0) return 0;
        return _releasableForAmount(alloc, released[account]);
    }

    // -------------------------------------------------------------------------
    // Internal — schedule
    // -------------------------------------------------------------------------

    function _vestedFromAmount(uint256 amount) internal view returns (uint256) {
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < start) return 0;

        uint256 tgePortion = (amount * TGE_BPS) / 10_000;
        if (nowTs >= start + LINEAR_DURATION) return amount;

        uint256 linearPortion = amount - tgePortion;
        uint256 elapsed = uint256(nowTs - start);
        return tgePortion + (linearPortion * elapsed) / uint256(LINEAR_DURATION);
    }

    function _releasableForAmount(uint256 amount, uint256 alreadyReleased) internal view returns (uint256) {
        uint256 vested = _vestedFromAmount(amount);
        if (vested <= alreadyReleased) return 0;
        return vested - alreadyReleased;
    }
}
