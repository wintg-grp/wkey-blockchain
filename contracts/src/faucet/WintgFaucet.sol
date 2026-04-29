// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA}                 from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title  WintgFaucet
 * @author WINTG Team
 * @notice Faucet testnet WINTG : distribue gratuitement WTG / WKEY /
 *         USDW / WCFA / WWTG aux développeurs pour tester la chaîne.
 *
 *         Sécurité contre les abus :
 *           - Limite par adresse / jour (ex: 100 WTG / address / 24h)
 *           - Captcha off-chain : le serveur signe une attestation
 *             "address X a réussi le captcha à timestamp T". On vérifie
 *             la signature on-chain via `signer` configurable.
 *           - Anti-replay : nonce par claim
 *
 *         L'utilisateur sur le site faucet :
 *           1. Connecte son wallet (ex: MetaMask)
 *           2. Résout un captcha (math, slider, etc.)
 *           3. Backend WINTG signe : `keccak256(address, token, amount, nonce, deadline)`
 *           4. User clique "Claim" → le faucet vérifie la signature et envoie
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract WintgFaucet is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Sentinel pour le WTG natif (EIP-7528).
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice signer autorisé (off-chain captcha verifier)
    address public signer;

    struct Drip {
        bool    active;
        uint256 amountPerClaim;   // tokens distribués par claim (wei)
        uint64  cooldownSeconds;  // ex: 86400 (24h)
    }

    /// @notice token => Drip configuration
    mapping(address => Drip) public drips;
    address[] public dripTokens;

    /// @notice user => token => last claim timestamp
    mapping(address => mapping(address => uint64)) public lastClaim;

    /// @notice nonce déjà utilisé (anti-replay)
    mapping(bytes32 => bool) public usedNonces;

    event Configured(address indexed token, uint256 amountPerClaim, uint64 cooldown, bool active);
    event Claimed(address indexed user, address indexed token, uint256 amount, bytes32 nonce);
    event SignerChanged(address indexed previous, address indexed current);
    event Topup(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error InvalidParams();
    error DripInactive();
    error CooldownActive(uint64 readyAt);
    error InvalidSignature();
    error NonceUsed(bytes32 nonce);
    error DeadlinePassed();
    error InsufficientReserve();
    error TransferFailed();

    constructor(address initialOwner, address initialSigner) Ownable(initialOwner) {
        if (initialSigner == address(0)) revert InvalidParams();
        signer = initialSigner;
        emit SignerChanged(address(0), initialSigner);
    }

    receive() external payable {
        emit Topup(NATIVE, msg.value);
    }

    // -------------------------------------------------------------------------
    // Owner — config
    // -------------------------------------------------------------------------

    function setDrip(address token, uint256 amountPerClaim, uint64 cooldown, bool active) external onlyOwner {
        if (amountPerClaim == 0 && active) revert InvalidParams();
        if (drips[token].amountPerClaim == 0 && active) {
            dripTokens.push(token);
        }
        drips[token] = Drip({ active: active, amountPerClaim: amountPerClaim, cooldownSeconds: cooldown });
        emit Configured(token, amountPerClaim, cooldown, active);
    }

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidParams();
        address prev = signer;
        signer = newSigner;
        emit SignerChanged(prev, newSigner);
    }

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (token == NATIVE) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Withdrawn(token, to, amount);
    }

    // -------------------------------------------------------------------------
    // Public — claim with signature
    // -------------------------------------------------------------------------

    /**
     * @notice Claim a drip. Requires:
     *          - signature from the configured `signer` covering
     *            (caller, token, amount, nonce, deadline, chainId, contract)
     *          - cooldown elapsed since last claim of this token
     */
    function claim(
        address token,
        uint256 amount,
        bytes32 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external nonReentrant {
        Drip memory d = drips[token];
        if (!d.active) revert DripInactive();
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (usedNonces[nonce]) revert NonceUsed(nonce);
        if (amount > d.amountPerClaim) revert InvalidParams();

        uint64 last = lastClaim[msg.sender][token];
        if (last != 0 && block.timestamp < last + d.cooldownSeconds) {
            revert CooldownActive(last + d.cooldownSeconds);
        }

        bytes32 messageHash = keccak256(
            abi.encode(
                "WINTG-FAUCET",
                block.chainid,
                address(this),
                msg.sender,
                token,
                amount,
                nonce,
                deadline
            )
        );
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        if (ECDSA.recover(ethSigned, signature) != signer) revert InvalidSignature();

        usedNonces[nonce] = true;
        lastClaim[msg.sender][token] = uint64(block.timestamp);

        if (token == NATIVE) {
            if (address(this).balance < amount) revert InsufficientReserve();
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal < amount) revert InsufficientReserve();
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit Claimed(msg.sender, token, amount, nonce);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function dripsCount() external view returns (uint256) { return dripTokens.length; }
    function reserveOf(address token) external view returns (uint256) {
        if (token == NATIVE) return address(this).balance;
        return IERC20(token).balanceOf(address(this));
    }
    function nextClaimAt(address user, address token) external view returns (uint64) {
        uint64 last = lastClaim[user][token];
        if (last == 0) return 0;
        return last + drips[token].cooldownSeconds;
    }
}
