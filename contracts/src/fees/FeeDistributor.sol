// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title  FeeDistributor
 * @author WINTG Team
 * @notice Distribue les frais de transaction selon la répartition WINTG :
 *         70 % Treasury / 20 % pool Validateurs / 10 % Burn.
 *
 *         Source des fees :
 *           Sur Besu IBFT 2.0 (26.x), les fees vont au coinbase du validateur
 *           (= EOA dérivée de la clé du nœud, pas paramétrable). Un keeper
 *           externe (cron) transfère donc périodiquement les fees collectées
 *           vers ce contrat puis appelle `distribute()`.
 *
 *         Garanties :
 *           - Les BPS sont **immutables** (anti-rugpull économique).
 *           - L'owner peut juste **rotater les destinataires** (Treasury,
 *             ValidatorPool, Burn) — utile en cas d'évolution des contrats.
 *           - `distribute()` est public et permissionless.
 */
contract FeeDistributor is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Constants — répartition immuable (basis points, sum = 10000)
    // -------------------------------------------------------------------------

    uint16 public constant TREASURY_BPS  = 7_000;  // 70 %
    uint16 public constant VALIDATOR_BPS = 2_000;  // 20 %
    uint16 public constant BURN_BPS      = 1_000;  // 10 %

    // -------------------------------------------------------------------------
    // State — destinataires (mutables, owner-only)
    // -------------------------------------------------------------------------

    address payable public treasury;
    address payable public validatorPool;
    address payable public burnContract;

    // Cumuls (lecture seule, pour stats)
    uint256 public cumulativeToTreasury;
    uint256 public cumulativeToValidators;
    uint256 public cumulativeToBurn;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FundsReceived(address indexed from, uint256 amount);
    event Distributed(uint256 toTreasury, uint256 toValidators, uint256 toBurn);
    event RecipientsUpdated(address treasury, address validatorPool, address burnContract);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error NothingToDistribute();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address initialOwner_,
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_
    ) Ownable(initialOwner_) {
        _setRecipients(treasury_, validatorPool_, burnContract_);
        // Sanity check : la somme des BPS doit faire 10000
        assert(TREASURY_BPS + VALIDATOR_BPS + BURN_BPS == 10_000);
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Distribute (public, permissionless)
    // -------------------------------------------------------------------------

    /**
     * @notice Répartit le solde courant entre Treasury / Validateurs / Burn.
     *         La distribution est effectuée en une transaction atomique : si
     *         l'un des transferts échoue, tout le reverte.
     */
    function distribute() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();

        uint256 toTreasury = (balance * TREASURY_BPS) / 10_000;
        uint256 toValidators = (balance * VALIDATOR_BPS) / 10_000;
        // Burn récupère le résidu pour éviter les pertes par arrondi
        uint256 toBurn = balance - toTreasury - toValidators;

        cumulativeToTreasury  += toTreasury;
        cumulativeToValidators += toValidators;
        cumulativeToBurn       += toBurn;

        emit Distributed(toTreasury, toValidators, toBurn);

        treasury.sendValue(toTreasury);
        validatorPool.sendValue(toValidators);
        burnContract.sendValue(toBurn);
    }

    // -------------------------------------------------------------------------
    // Owner — rotation des destinataires
    // -------------------------------------------------------------------------

    function setRecipients(
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_
    ) external onlyOwner {
        _setRecipients(treasury_, validatorPool_, burnContract_);
    }

    function _setRecipients(
        address payable treasury_,
        address payable validatorPool_,
        address payable burnContract_
    ) internal {
        if (treasury_ == address(0) || validatorPool_ == address(0) || burnContract_ == address(0)) {
            revert ZeroAddress();
        }
        treasury = treasury_;
        validatorPool = validatorPool_;
        burnContract = burnContract_;
        emit RecipientsUpdated(treasury_, validatorPool_, burnContract_);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Solde en attente de répartition.
    function pendingDistribution() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Cumul total distribué (somme des trois flux).
    function cumulativeDistributed() external view returns (uint256) {
        return cumulativeToTreasury + cumulativeToValidators + cumulativeToBurn;
    }
}
