// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IPriceFeed {
    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

/**
 * @title  ValidatorRegistry
 * @author WINTG Team
 * @notice On-chain registry of WINTG validators. Two responsibilities:
 *
 *           1. Public candidacy: anyone can apply by posting a USD-denominated
 *              bond paid in native WTG. The required bond is set in USD by
 *              governance and converted on-the-fly using a WTG/USD price feed.
 *
 *           2. Public directory of active validators: name, organisation,
 *              website, PGP, location, enode — readable by explorers and dApps.
 *
 *         Lifecycle of a candidacy:
 *           applyAsValidator()   -> Pending  (bond locked in this contract)
 *           approveCandidate()   -> Approved (admin must also call
 *                                  ibft_proposeValidatorVote(true, addr) on
 *                                  existing nodes to add to consensus)
 *           rejectCandidate()    -> Rejected (full bond refunded)
 *           remove()             -> Removed  (clean exit, remaining bond refunded)
 *           slash()              -> partial deduction, sent to treasury
 *
 *         Bond mechanics:
 *           - Bond is denominated in USD (8-decimal fixed point, Chainlink-style).
 *           - At application time, the contract reads the price feed and requires
 *             enough WTG to cover the USD bond.
 *           - Admin / DAO can change `minBondUsd` at any time. Existing bonds
 *             remain locked at the WTG value paid at application time, but the
 *             new minimum applies to future applicants.
 *           - On clean exit, the validator gets back whatever WTG remains in
 *             their bond after any slashing.
 *
 *         Ownership is intended to be transferred to a multisig / timelock
 *         after bootstrap so changes go through governance.
 */
contract ValidatorRegistry is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    enum Status { Unknown, Pending, Approved, Rejected, Removed }

    struct ValidatorInfo {
        address validatorAddress;
        string  name;
        string  organization;
        string  websiteUrl;
        string  contactPgp;
        string  geographicLocation;
        string  enodeUrl;
        uint256 bondAmount;     // remaining bond in WTG (wei)
        uint256 bondPaidUsd;    // USD amount paid at application (8 decimals)
        uint64  joinedAt;
        Status  status;
    }

    /// @notice Minimum bond required to apply, expressed in USD with 8 decimals.
    /// E.g. 10 USD => `minBondUsd = 10 * 1e8 = 1_000_000_000`.
    /// Adjustable by the owner (intended to be a DAO/multisig post-bootstrap).
    uint256 public minBondUsd;

    /// @notice Address of the WTG/USD price feed (AggregatorV3-compatible).
    IPriceFeed public priceFeed;

    /// @notice Where slashed funds are sent. Typically the WINTG Treasury.
    address payable public slashRecipient;

    /// @notice Maximum acceptable age for the price feed reading.
    uint64 public constant MAX_PRICE_AGE = 1 hours;

    mapping(address => ValidatorInfo) public validators;
    address[] public validatorList;
    mapping(address => uint256) private _indexOf;          // 1-based

    address[] public candidateList;
    mapping(address => uint256) private _candidateIndex;   // 1-based

    event Applied(address indexed candidate, string name, uint256 bondWtg, uint256 bondUsd);
    event Approved(address indexed validator, string name);
    event Rejected(address indexed candidate, uint256 bondReturned);
    event Slashed(address indexed validator, uint16 percentBps, uint256 amountToTreasury);
    event ValidatorAdded(address indexed validator, string name, string organization);
    event ValidatorUpdated(address indexed validator, string name);
    event ValidatorRemoved(address indexed validator, uint256 bondReturned);
    event MinBondUsdChanged(uint256 oldUsd, uint256 newUsd);
    event PriceFeedChanged(address indexed oldFeed, address indexed newFeed);
    event SlashRecipientChanged(address indexed oldRecipient, address indexed newRecipient);

    error AlreadyRegistered(address v);
    error NotRegistered(address v);
    error NotPending(address v);
    error NotApproved(address v);
    error EmptyName();
    error InsufficientBond(uint256 sent, uint256 required);
    error PriceFeedStale(uint256 updatedAt);
    error InvalidPrice();
    error InvalidPercent(uint16 bps);
    error ZeroAddress();

    constructor(
        address initialOwner_,
        address priceFeed_,
        address payable slashRecipient_,
        uint256 minBondUsd_
    ) Ownable(initialOwner_) {
        if (priceFeed_ == address(0) || slashRecipient_ == address(0)) revert ZeroAddress();
        priceFeed = IPriceFeed(priceFeed_);
        slashRecipient = slashRecipient_;
        minBondUsd = minBondUsd_;
        emit PriceFeedChanged(address(0), priceFeed_);
        emit SlashRecipientChanged(address(0), slashRecipient_);
        emit MinBondUsdChanged(0, minBondUsd_);
    }

    // ----- Public candidacy --------------------------------------------------

    /// @notice Apply to become a validator. Caller must send at least the WTG
    /// equivalent of `minBondUsd` based on the current price feed reading.
    function applyAsValidator(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation,
        string calldata enodeUrl
    ) external payable {
        Status current = validators[validatorAddress].status;
        if (current == Status.Approved || current == Status.Pending) {
            revert AlreadyRegistered(validatorAddress);
        }
        if (bytes(name).length == 0) revert EmptyName();

        uint256 requiredWei = bondInWtgWei();
        if (msg.value < requiredWei) revert InsufficientBond(msg.value, requiredWei);

        validators[validatorAddress] = ValidatorInfo({
            validatorAddress:   validatorAddress,
            name:               name,
            organization:       organization,
            websiteUrl:         websiteUrl,
            contactPgp:         contactPgp,
            geographicLocation: geographicLocation,
            enodeUrl:           enodeUrl,
            bondAmount:         msg.value,
            bondPaidUsd:        minBondUsd,
            joinedAt:           0,
            status:             Status.Pending
        });
        candidateList.push(validatorAddress);
        _candidateIndex[validatorAddress] = candidateList.length;

        emit Applied(validatorAddress, name, msg.value, minBondUsd);
    }

    /// @notice Approve a pending candidate. After this, the admin must also
    /// call `ibft_proposeValidatorVote(true, addr)` on each existing Besu node
    /// for the candidate to enter the consensus set.
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

    /// @notice Reject a pending candidate. Full bond is refunded.
    function rejectCandidate(address candidate) external onlyOwner nonReentrant {
        ValidatorInfo storage v = validators[candidate];
        if (v.status != Status.Pending) revert NotPending(candidate);

        uint256 bond = v.bondAmount;
        v.bondAmount = 0;
        v.status = Status.Rejected;

        _removeFromCandidates(candidate);

        if (bond > 0) payable(candidate).sendValue(bond);
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

    // ----- Slashing & exit ---------------------------------------------------

    /// @notice Partially slash a validator's bond. `percentBps` is in basis
    /// points (0–10000). Slashed funds go to `slashRecipient`.
    /// Used for proven misbehavior; the validator stays on consensus until
    /// `remove()` is called separately.
    function slash(address validator_, uint16 percentBps) external onlyOwner nonReentrant {
        if (percentBps == 0 || percentBps > 10_000) revert InvalidPercent(percentBps);
        ValidatorInfo storage v = validators[validator_];
        if (v.status != Status.Approved) revert NotApproved(validator_);

        uint256 amount = (v.bondAmount * percentBps) / 10_000;
        if (amount == 0) return;
        v.bondAmount -= amount;
        slashRecipient.sendValue(amount);
        emit Slashed(validator_, percentBps, amount);
    }

    /// @notice Remove an approved validator. Refunds the remaining bond
    /// (after any prior slashing). The admin must also remove the validator
    /// from the consensus set via `ibft_proposeValidatorVote(false, addr)`.
    function remove(address validatorAddress) external onlyOwner nonReentrant {
        uint256 idx = _indexOf[validatorAddress];
        if (idx == 0) revert NotRegistered(validatorAddress);

        ValidatorInfo storage v = validators[validatorAddress];
        uint256 bond = v.bondAmount;

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

        if (bond > 0) payable(validatorAddress).sendValue(bond);
        emit ValidatorRemoved(validatorAddress, bond);
    }

    // ----- Admin / governance ------------------------------------------------

    /// @notice Set the minimum bond in USD (8 decimals).
    function setMinBondUsd(uint256 newMinBondUsd) external onlyOwner {
        emit MinBondUsdChanged(minBondUsd, newMinBondUsd);
        minBondUsd = newMinBondUsd;
    }

    function setPriceFeed(address newFeed) external onlyOwner {
        if (newFeed == address(0)) revert ZeroAddress();
        emit PriceFeedChanged(address(priceFeed), newFeed);
        priceFeed = IPriceFeed(newFeed);
    }

    function setSlashRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit SlashRecipientChanged(slashRecipient, newRecipient);
        slashRecipient = newRecipient;
    }

    /// @notice Insert a validator directly (bootstrap-only, no bond). Reserved
    /// for the genesis validator set and for one-off corrections.
    function add(
        address validatorAddress,
        string calldata name,
        string calldata organization,
        string calldata websiteUrl,
        string calldata contactPgp,
        string calldata geographicLocation,
        string calldata enodeUrl
    ) external onlyOwner {
        Status current = validators[validatorAddress].status;
        if (current == Status.Approved || current == Status.Pending) {
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
            bondPaidUsd:        0,
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

    // ----- Views -------------------------------------------------------------

    /// @notice Return the WTG amount (in wei) currently required to apply.
    /// Reverts if the price feed reading is stale or non-positive.
    function bondInWtgWei() public view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        if (price <= 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > MAX_PRICE_AGE) revert PriceFeedStale(updatedAt);

        // Both `minBondUsd` and `price` use the feed's decimals (8 by convention).
        // requiredWei = (minBondUsd * 1e18) / price
        // Both numerator and denominator share the price-feed decimals so they
        // cancel out, leaving a value in wei.
        uint256 priceU = uint256(price);
        return (minBondUsd * 1e18) / priceU;
    }

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
