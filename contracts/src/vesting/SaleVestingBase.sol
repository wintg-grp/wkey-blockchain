// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  SaleVestingBase
 * @author WINTG Team
 * @notice Base abstraite pour les vestings multi-bénéficiaires (PublicSale,
 *         PrivateSale). L'owner publie les allocations par lots après le
 *         déploiement. Chaque acheteur peut ensuite libérer sa portion vestée
 *         selon le schedule défini par les enfants : `tgeBps()`, `cliff()`,
 *         `linearDuration()`.
 *
 *         Le contrat est financé par la pré-allocation du Genesis (la totalité
 *         du quota de la tranche est crédité à l'adresse du contrat au bloc 0).
 */
abstract contract SaleVestingBase is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Immutable state
    // -------------------------------------------------------------------------

    /// @notice Timestamp Unix de début du vesting (TGE).
    uint64 public immutable start;

    /// @notice Quota total de la tranche (somme des allocations).
    uint256 public immutable cap;

    // -------------------------------------------------------------------------
    // Mutable state
    // -------------------------------------------------------------------------

    mapping(address => uint256) public allocation;
    mapping(address => uint256) public released;
    uint256 public totalAllocated;

    /// @notice `true` une fois `finalize()` appelé : plus aucune allocation possible.
    bool public finalized;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AllocationSet(address indexed buyer, uint256 amount);
    event Released(address indexed buyer, uint256 amount);
    event Finalized(uint256 totalAllocated);
    event FundsReceived(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroCap();
    error AlreadyFinalized();
    error NotFinalized();
    error LengthMismatch();
    error AllocationAlreadySet(address buyer);
    error CapExceeded(uint256 wouldBe, uint256 cap);
    error NoAllocation();
    error NothingToRelease();
    error InsufficientBalance(uint256 required, uint256 available);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner_, uint64 start_, uint256 cap_) Ownable(initialOwner_) {
        if (cap_ == 0) revert ZeroCap();
        start = start_;
        cap = cap_;
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Owner — Allocations
    // -------------------------------------------------------------------------

    /**
     * @notice Enregistre les allocations par lot. Réservé à l'owner avant
     *         finalisation. Pas de doublons : une adresse ne peut être
     *         allouée qu'une fois.
     */
    function setAllocations(address[] calldata buyers, uint256[] calldata amounts) external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        if (buyers.length != amounts.length) revert LengthMismatch();

        uint256 newTotal = totalAllocated;
        for (uint256 i = 0; i < buyers.length; i++) {
            address buyer = buyers[i];
            uint256 amount = amounts[i];
            if (allocation[buyer] != 0) revert AllocationAlreadySet(buyer);
            allocation[buyer] = amount;
            newTotal += amount;
            emit AllocationSet(buyer, amount);
        }
        if (newTotal > cap) revert CapExceeded(newTotal, cap);
        totalAllocated = newTotal;
    }

    /// @notice Verrouille définitivement les allocations.
    function finalize() external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        finalized = true;
        emit Finalized(totalAllocated);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Buyer — Release
    // -------------------------------------------------------------------------

    /**
     * @notice Libère la portion vestée de l'allocation de `msg.sender`.
     *         Disponible uniquement après finalisation pour éviter les
     *         conditions de course pendant la mise en place.
     */
    function release() external nonReentrant whenNotPaused {
        if (!finalized) revert NotFinalized();

        uint256 alloc = allocation[msg.sender];
        if (alloc == 0) revert NoAllocation();

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
    // Views
    // -------------------------------------------------------------------------

    function vestedAmount(address buyer) external view returns (uint256) {
        return _vestedFromAmount(allocation[buyer]);
    }

    function getReleasable(address buyer) external view returns (uint256) {
        return _releasableForAmount(allocation[buyer], released[buyer]);
    }

    // -------------------------------------------------------------------------
    // Schedule constants — to be overridden by children
    // -------------------------------------------------------------------------

    /// @notice Pourcentage débloqué au TGE en basis points (10000 = 100 %).
    function tgeBps() public view virtual returns (uint16);

    /// @notice Cliff en secondes après `start`.
    function cliffDuration() public view virtual returns (uint64);

    /// @notice Durée du vesting linéaire en secondes après le cliff.
    function linearDuration() public view virtual returns (uint64);

    // -------------------------------------------------------------------------
    // Internal — schedule
    // -------------------------------------------------------------------------

    function _vestedFromAmount(uint256 amount) internal view returns (uint256) {
        if (amount == 0) return 0;
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < start) return 0;

        uint256 tgePortion = (amount * tgeBps()) / 10_000;
        uint64 cliffEnd = start + cliffDuration();
        if (nowTs < cliffEnd) return tgePortion;

        uint64 vestingEnd = cliffEnd + linearDuration();
        if (nowTs >= vestingEnd) return amount;

        uint256 linearPortion = amount - tgePortion;
        uint256 elapsed = uint256(nowTs - cliffEnd);
        return tgePortion + (linearPortion * elapsed) / uint256(linearDuration());
    }

    function _releasableForAmount(uint256 amount, uint256 alreadyReleased) internal view returns (uint256) {
        uint256 vested = _vestedFromAmount(amount);
        if (vested <= alreadyReleased) return 0;
        return vested - alreadyReleased;
    }
}
