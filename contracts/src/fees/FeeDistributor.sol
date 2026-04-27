// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  FeeDistributor
 * @author WINTG Team
 * @notice Splits transaction fees according to the WINTG distribution policy:
 *
 *           - 40 % Treasury
 *           - 50 % Validator pool
 *           -  5 % Burn
 *           -  5 % Community pool (campaigns, airdrops, ecosystem rewards)
 *
 *         Source of fees:
 *           On Hyperledger Besu / IBFT 2.0 (26.x), block fees go to the
 *           validator's coinbase (the EOA derived from its node key — not
 *           configurable). An external keeper sweeps that balance into this
 *           contract periodically and calls `distribute()`.
 *
 *         Guarantees:
 *           - The basis-point split is **immutable** (no rugpull on economics).
 *           - The owner can rotate the recipient addresses (Treasury, validator
 *             pool, burn contract, community pool) — useful when underlying
 *             contracts are upgraded.
 *           - `distribute()` is permissionless: anyone can call it.
 */
contract FeeDistributor is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    // ----- Constants — immutable split (basis points, sum = 10000) ----------

    uint16 public constant TREASURY_BPS  = 4_000;  // 40 %
    uint16 public constant VALIDATOR_BPS = 5_000;  // 50 %
    uint16 public constant BURN_BPS      =   500;  //  5 %
    uint16 public constant COMMUNITY_BPS =   500;  //  5 %

    // ----- State — recipients (mutable, owner-only) -------------------------

    address payable public treasury;
    address payable public validatorPool;
    address payable public burnContract;
    address payable public communityPool;

    // Cumulative counters (read-only, for stats)
    uint256 public cumulativeToTreasury;
    uint256 public cumulativeToValidators;
    uint256 public cumulativeToBurn;
    uint256 public cumulativeToCommunity;

    event FundsReceived(address indexed from, uint256 amount);
    event Distributed(uint256 toTreasury, uint256 toValidators, uint256 toBurn, uint256 toCommunity);
    event RecipientsUpdated(
        address treasury,
        address validatorPool,
        address burnContract,
        address communityPool
    );

    error ZeroAddress();
    error NothingToDistribute();
    error TransferFailed();

    constructor(
        address initialOwner_,
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_,
        address payable communityPool_
    ) Ownable(initialOwner_) {
        _setRecipients(treasury_, validatorPool_, burnContract_, communityPool_);
        // Sanity: BPS must total 10_000
        assert(TREASURY_BPS + VALIDATOR_BPS + BURN_BPS + COMMUNITY_BPS == 10_000);
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // ----- Distribute (permissionless) --------------------------------------

    /**
     * @notice Splits the contract's current balance among Treasury, validator
     *         pool, burn, and community pool. Atomic — if any transfer fails,
     *         the whole call reverts.
     */
    function distribute() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();

        uint256 toTreasury   = (balance * TREASURY_BPS)  / 10_000;
        uint256 toValidators = (balance * VALIDATOR_BPS) / 10_000;
        uint256 toBurn       = (balance * BURN_BPS)      / 10_000;
        // Community gets the remainder (absorbs rounding dust)
        uint256 toCommunity  = balance - toTreasury - toValidators - toBurn;

        cumulativeToTreasury  += toTreasury;
        cumulativeToValidators += toValidators;
        cumulativeToBurn       += toBurn;
        cumulativeToCommunity  += toCommunity;

        emit Distributed(toTreasury, toValidators, toBurn, toCommunity);

        treasury.sendValue(toTreasury);
        validatorPool.sendValue(toValidators);
        burnContract.sendValue(toBurn);
        communityPool.sendValue(toCommunity);
    }

    // ----- Owner — recipient rotation ---------------------------------------

    function setRecipients(
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_,
        address payable communityPool_
    ) external onlyOwner {
        _setRecipients(treasury_, validatorPool_, burnContract_, communityPool_);
    }

    function _setRecipients(
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_,
        address payable communityPool_
    ) internal {
        if (
            treasury_      == address(0) ||
            validatorPool_ == address(0) ||
            burnContract_  == address(0) ||
            communityPool_ == address(0)
        ) revert ZeroAddress();

        treasury      = treasury_;
        validatorPool = validatorPool_;
        burnContract  = burnContract_;
        communityPool = communityPool_;

        emit RecipientsUpdated(treasury_, validatorPool_, burnContract_, communityPool_);
    }

    // ----- Views -------------------------------------------------------------

    /// @notice Balance currently waiting to be distributed.
    function pendingDistribution() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Total cumulative amount distributed across all four buckets.
    function cumulativeDistributed() external view returns (uint256) {
        return cumulativeToTreasury
             + cumulativeToValidators
             + cumulativeToBurn
             + cumulativeToCommunity;
    }
}
