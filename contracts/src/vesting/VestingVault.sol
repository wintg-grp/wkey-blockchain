// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  VestingVault
 * @author WINTG Team
 * @notice Coffre de vesting linéaire (avec cliff + tranche TGE) pour la pièce
 *         native WTG. Sert de socle réutilisable aux contrats spécialisés
 *         (TeamVesting, AdvisorsVesting, EcosystemVesting, etc.).
 *
 * @dev   Modèle de vesting :
 *         - À `start` : `tgeAmount` est immédiatement libérable (TGE unlock).
 *         - De `start` à `start + cliff` : aucune libération supplémentaire.
 *         - De `start + cliff` à `start + cliff + linearDuration` : vesting
 *           linéaire de `(totalAllocation - tgeAmount)`.
 *         - Au-delà : tout est libérable.
 *
 *         Le contrat est financé par la pré-allocation du Genesis (le solde
 *         natif est crédité directement à l'adresse du contrat au bloc 0).
 *         Il peut aussi recevoir des dépôts post-déploiement via `receive()`.
 *
 *         Patterns sécurité :
 *         - `Ownable2Step` : transfert d'ownership en deux étapes.
 *         - `ReentrancyGuard` : protection sur `release()` et `revoke()`.
 *         - `Pausable` : pause d'urgence (uniquement `release()`, jamais
 *           `revoke()` pour ne pas bloquer l'owner en cas d'incident).
 *         - Variables immuables sur tous les paramètres de vesting.
 *
 *         Ce contrat ne supporte PAS la modification du bénéficiaire après
 *         déploiement (pour des raisons de prévisibilité). Si le bénéficiaire
 *         doit changer, ré-émettre un nouveau VestingVault.
 */
contract VestingVault is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Durée maximale acceptée pour cliff + linéaire (10 ans en secondes).
    /// @dev    Garde-fou contre les valeurs aberrantes lors du déploiement.
    uint64 public constant MAX_TOTAL_DURATION = 10 * 365 days;

    // -------------------------------------------------------------------------
    // Immutable parameters
    // -------------------------------------------------------------------------

    /// @notice Adresse qui peut réclamer les WTG vestés via `release()`.
    address public immutable beneficiary;

    /// @notice Timestamp Unix du début du vesting (TGE).
    uint64 public immutable start;

    /// @notice Durée du cliff en secondes (à partir de `start`).
    uint64 public immutable cliff;

    /// @notice Durée du vesting linéaire en secondes (à partir de `start + cliff`).
    uint64 public immutable linearDuration;

    /// @notice Montant débloqué au TGE (en wei). Inclus dans `totalAllocation`.
    uint256 public immutable tgeAmount;

    /// @notice Allocation totale du bénéficiaire (en wei).
    uint256 public immutable totalAllocation;

    /// @notice Si `true`, l'owner peut révoquer le vesting (récupère le non-vesté).
    bool public immutable revocable;

    // -------------------------------------------------------------------------
    // Mutable state
    // -------------------------------------------------------------------------

    /// @notice Cumul des WTG déjà libérés au bénéficiaire.
    uint256 public released;

    /// @notice `true` si le vesting a été révoqué par l'owner.
    bool public revoked;

    /// @notice Timestamp de la révocation (figé pour les calculs post-revoke).
    uint64 public revokedAt;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Émis lors d'une libération de tokens au bénéficiaire.
    event TokensReleased(address indexed beneficiary, uint256 amount);

    /// @notice Émis lorsque l'owner révoque le vesting.
    event VestingRevoked(address indexed by, uint256 returnedToOwner, uint64 atTimestamp);

    /// @notice Émis lorsque le contrat reçoit des fonds.
    event FundsReceived(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroBeneficiary();
    error ZeroAllocation();
    error TgeExceedsAllocation();
    error CliffOrDurationTooLong();
    error NotRevocable();
    error AlreadyRevoked();
    error NothingToRelease();
    error TransferFailed();
    error InsufficientBalance(uint256 required, uint256 available);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner_         Adresse propriétaire (multisig recommandé).
     *                              Reçoit le non-vesté en cas de révocation.
     * @param beneficiary_          Adresse qui pourra appeler `release()`.
     * @param start_                Timestamp Unix de début (TGE).
     * @param cliffSeconds          Durée du cliff après `start_`.
     * @param linearDurationSeconds Durée du vesting linéaire après le cliff.
     * @param tgeAmount_            WTG libérés à `start_` (peut être 0).
     * @param totalAllocation_      Allocation totale (>= tgeAmount_).
     * @param revocable_            Si `true`, l'owner peut révoquer.
     */
    constructor(
        address initialOwner_,
        address beneficiary_,
        uint64 start_,
        uint64 cliffSeconds,
        uint64 linearDurationSeconds,
        uint256 tgeAmount_,
        uint256 totalAllocation_,
        bool revocable_
    ) Ownable(initialOwner_) {
        if (beneficiary_ == address(0)) revert ZeroBeneficiary();
        if (totalAllocation_ == 0) revert ZeroAllocation();
        if (tgeAmount_ > totalAllocation_) revert TgeExceedsAllocation();
        if (uint256(cliffSeconds) + uint256(linearDurationSeconds) > MAX_TOTAL_DURATION) {
            revert CliffOrDurationTooLong();
        }

        beneficiary     = beneficiary_;
        start           = start_;
        cliff           = cliffSeconds;
        linearDuration  = linearDurationSeconds;
        tgeAmount       = tgeAmount_;
        totalAllocation = totalAllocation_;
        revocable       = revocable_;
    }

    // -------------------------------------------------------------------------
    // Receive — accepte les WTG natifs (genesis + dépôts)
    // -------------------------------------------------------------------------

    /// @notice Permet au contrat de recevoir des WTG natifs.
    /// @dev    Le contrat est principalement financé par le Genesis ; les
    ///         dépôts ultérieurs sont autorisés mais ne modifient pas le
    ///         vesting (le calendrier est fixé par `totalAllocation` immutable).
    ///         Tout WTG reçu au-delà de `totalAllocation` reste piégé sauf
    ///         intervention de l'owner via une opération de sweep externe
    ///         (volontairement non implémentée pour limiter la surface).
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Public actions
    // -------------------------------------------------------------------------

    /**
     * @notice Libère au bénéficiaire tous les WTG vestés et non encore réclamés.
     * @dev    Callable par n'importe qui (utile pour les keepers / scripts).
     *         Les fonds vont toujours à `beneficiary`, jamais à `msg.sender`.
     */
    function release() external nonReentrant whenNotPaused {
        uint256 amount = getReleasable();
        if (amount == 0) revert NothingToRelease();

        uint256 balance = address(this).balance;
        if (balance < amount) revert InsufficientBalance(amount, balance);

        released += amount;
        emit TokensReleased(beneficiary, amount);

        payable(beneficiary).sendValue(amount);
    }

    /**
     * @notice Révoque le vesting : renvoie la portion non-vestée à l'owner.
     *         Le bénéficiaire conserve le droit de réclamer la portion déjà
     *         vestée jusqu'au moment de la révocation.
     * @dev    Réservé à l'owner. Ne fonctionne que si `revocable == true`.
     *         Ne peut être appelée qu'une fois.
     */
    function revoke() external onlyOwner nonReentrant {
        if (!revocable) revert NotRevocable();
        if (revoked) revert AlreadyRevoked();

        uint64 nowTs = uint64(block.timestamp);
        uint256 vested = _vestedAmount(nowTs);
        uint256 unvested = totalAllocation - vested;

        revoked   = true;
        revokedAt = nowTs;

        emit VestingRevoked(_msgSender(), unvested, nowTs);

        if (unvested > 0) {
            uint256 balance = address(this).balance;
            uint256 toSend = unvested > balance ? balance : unvested;
            if (toSend > 0) {
                payable(owner()).sendValue(toSend);
            }
        }
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Montant actuellement libérable au bénéficiaire.
     * @return Montant en wei (zéro si rien à libérer).
     */
    function getReleasable() public view returns (uint256) {
        uint64 referenceTime = revoked ? revokedAt : uint64(block.timestamp);
        uint256 vested = _vestedAmount(referenceTime);
        if (vested <= released) return 0;
        return vested - released;
    }

    /**
     * @notice Montant total vesté à un timestamp donné (pour stats / UI).
     * @param  timestamp Timestamp Unix d'évaluation.
     * @return Montant vesté en wei.
     */
    function vestedAmount(uint64 timestamp) external view returns (uint256) {
        return _vestedAmount(timestamp);
    }

    /// @notice Timestamp de fin du vesting (vesting 100 % complet).
    function end() external view returns (uint64) {
        return start + cliff + linearDuration;
    }

    // -------------------------------------------------------------------------
    // Owner controls
    // -------------------------------------------------------------------------

    /// @notice Met en pause les libérations (pas la révocation).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Reprend les libérations après pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Internal — schedule
    // -------------------------------------------------------------------------

    /**
     * @dev Calcule le montant total vesté à `timestamp`.
     *      Schéma :
     *        timestamp < start                                  → 0
     *        start <= timestamp < start + cliff                 → tgeAmount
     *        start + cliff <= timestamp < start + cliff + dur   → tge + linéaire
     *        timestamp >= start + cliff + linearDuration        → totalAllocation
     */
    function _vestedAmount(uint64 timestamp) internal view returns (uint256) {
        if (timestamp < start) {
            return 0;
        }

        uint64 cliffEnd = start + cliff;
        if (timestamp < cliffEnd) {
            return tgeAmount;
        }

        uint64 vestingEnd = cliffEnd + linearDuration;
        if (timestamp >= vestingEnd) {
            return totalAllocation;
        }

        // Phase linéaire : (totalAllocation - tgeAmount) * elapsed / linearDuration
        uint256 linearPortion = totalAllocation - tgeAmount;
        uint256 elapsed = uint256(timestamp - cliffEnd);
        return tgeAmount + (linearPortion * elapsed) / uint256(linearDuration);
    }
}
