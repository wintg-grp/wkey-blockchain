// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA}                 from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title  WintgPaymaster — Verifying Paymaster (simplified, EntryPoint-free)
 * @author WINTG Team
 * @notice Sponsorise le gaz pour des transactions méta signées par WINTG.
 *
 *         Modèle minimaliste, indépendant de l'EntryPoint ERC-4337 (qu'on
 *         déploiera plus tard en 0.7.0 quand l'écosystème sera prêt) :
 *
 *           - Le user signe une **operation** (target, callData, deadline,
 *             nonce) — pas de gas envoyé par lui.
 *           - Le **signer WINTG** signe ensuite cette operation pour
 *             attester que le paymaster va sponsoriser.
 *           - Un **relayer** soumet la tx, qui appelle `executeMetaTx` —
 *             le paymaster envoie le call et paie le gas (depuis son
 *             balance topup).
 *
 *         Quotas anti-abus :
 *           - max N tx/jour par user (default 10)
 *           - max gas par tx (default 500k)
 *
 *         Topup : le treasury envoie WTG natif au paymaster.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 *         Ce design est sécurisé tant que :
 *           - Le signer WINTG ne signe que des operations vérifiées
 *             (validation off-chain : KYC, captcha, rate-limit)
 *           - Le user revient avec sa propre signature pour sécuriser le call
 */
contract WintgPaymaster is Ownable2Step, ReentrancyGuard {
    bytes32 private constant META_TX_TYPEHASH = keccak256(
        "MetaTx(address user,address target,bytes callData,uint256 value,uint256 deadline,uint256 nonce)"
    );

    /// @notice EIP-712 domain separator (cached at deploy).
    bytes32 public immutable DOMAIN_SEPARATOR;

    address public signer;
    address public treasury;

    uint64  public maxTxPerDay   = 10;
    uint256 public maxGasPerTx   = 500_000;
    uint96  public markupBps     = 1000; // 10 %

    /// @notice user => day timestamp (unix / 86400) => count
    mapping(address => mapping(uint256 => uint64)) public dailyCount;

    /// @notice user => nonce
    mapping(address => uint256) public nonces;

    bool public paused;

    event Sponsored(address indexed user, address indexed target, uint256 gasUsed, uint256 weiSpent);
    event SignerChanged(address indexed previous, address indexed current);
    event TreasuryChanged(address indexed previous, address indexed current);
    event LimitsChanged(uint64 maxTxPerDay, uint256 maxGasPerTx, uint96 markupBps);
    event Paused();
    event Unpaused();
    event Topup(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error PaymasterPaused();
    error InvalidSigner();
    error InvalidWintgSignature();
    error InvalidUserSignature();
    error DeadlineExceeded();
    error NonceMismatch(uint256 have, uint256 expected);
    error DailyQuotaExceeded(uint64 count, uint64 limit);
    error GasOverLimit(uint256 used, uint256 limit);
    error InvalidParams();
    error CallFailed(bytes ret);
    error TransferFailed();

    constructor(address initialOwner, address initialSigner, address initialTreasury) Ownable(initialOwner) {
        if (initialSigner == address(0) || initialTreasury == address(0)) revert InvalidParams();
        signer = initialSigner;
        treasury = initialTreasury;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("WintgPaymaster"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));

        emit SignerChanged(address(0), initialSigner);
        emit TreasuryChanged(address(0), initialTreasury);
    }

    receive() external payable {
        emit Topup(msg.sender, msg.value);
    }

    /**
     * @notice Exécute une meta-transaction sponsorisée.
     *         Le paymaster doit avoir assez de WTG pour couvrir le gas.
     *
     * @param  user            l'utilisateur final (origin)
     * @param  target          contrat à appeler
     * @param  callData        calldata du call
     * @param  value           valeur WTG à attacher au call (sortira du paymaster)
     * @param  deadline        timestamp d'expiration de la meta-tx
     * @param  userNonce       nonce du user (anti-replay)
     * @param  userSig         signature du user sur le digest (autorisation explicite)
     * @param  wintgSig        signature de `signer` (validation off-chain WINTG)
     */
    function executeMetaTx(
        address user,
        address target,
        bytes calldata callData,
        uint256 value,
        uint256 deadline,
        uint256 userNonce,
        bytes calldata userSig,
        bytes calldata wintgSig
    ) external nonReentrant {
        if (paused) revert PaymasterPaused();
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (userNonce != nonces[user]) revert NonceMismatch(userNonce, nonces[user]);

        uint256 day = block.timestamp / 1 days;
        uint64 cur = dailyCount[user][day];
        if (cur >= maxTxPerDay) revert DailyQuotaExceeded(cur, maxTxPerDay);
        dailyCount[user][day] = cur + 1;
        nonces[user] = userNonce + 1;

        bytes32 structHash = keccak256(abi.encode(META_TX_TYPEHASH, user, target, keccak256(callData), value, deadline, userNonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        // Both signatures required.
        if (ECDSA.recover(digest, userSig)  != user)  revert InvalidUserSignature();
        if (ECDSA.recover(digest, wintgSig) != signer) revert InvalidWintgSignature();

        uint256 startGas = gasleft();
        (bool ok, bytes memory ret) = target.call{value: value}(callData);
        if (!ok) revert CallFailed(ret);

        uint256 gasUsed = startGas - gasleft();
        if (gasUsed > maxGasPerTx) revert GasOverLimit(gasUsed, maxGasPerTx);

        // Total wei spent = value + gas × tx.gasprice × (1 + markup)
        uint256 weiSpent = value + (gasUsed * tx.gasprice * (10_000 + markupBps)) / 10_000;
        emit Sponsored(user, target, gasUsed, weiSpent);
    }

    // -------------------------------------------------------------------------
    // Owner — admin
    // -------------------------------------------------------------------------

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidSigner();
        address previous = signer;
        signer = newSigner;
        emit SignerChanged(previous, newSigner);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function setLimits(uint64 maxTxPerDay_, uint256 maxGasPerTx_, uint96 markupBps_) external onlyOwner {
        if (maxTxPerDay_ == 0 || maxGasPerTx_ < 21_000 || markupBps_ > 5000) revert InvalidParams();
        maxTxPerDay = maxTxPerDay_;
        maxGasPerTx = maxGasPerTx_;
        markupBps   = markupBps_;
        emit LimitsChanged(maxTxPerDay_, maxGasPerTx_, markupBps_);
    }

    function pause()   external onlyOwner { paused = true;  emit Paused();   }
    function unpause() external onlyOwner { paused = false; emit Unpaused(); }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(treasury, amount);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
