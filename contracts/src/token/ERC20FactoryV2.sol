// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {SimpleERC20V2} from "./SimpleERC20V2.sol";
import {VerificationRegistry} from "../verification/VerificationRegistry.sol";

/**
 * @title  ERC20FactoryV2
 * @author WINTG Team
 * @notice Factory publique pour déployer des `SimpleERC20V2` avec frais
 *         WINTG (100 WTG par défaut, gratuit pour la team WINTG).
 *
 *         Frais répartis :
 *           - 70 % treasury
 *           - 20 % verification admin (incentive auditeur)
 *           - 10 % burn
 *
 *         Le créateur peut activer en option : ERC20Votes, MintableCap,
 *         Soulbound. Logo URI optionnel à la création.
 *
 *         Liste blanche team WINTG : géré par le multisig (`addTeamMember`,
 *         `removeTeamMember`). Une adresse team peut créer des tokens
 *         gratuitement (gas only).
 *
 * @dev    Conformes WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract ERC20FactoryV2 is Ownable2Step, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Distribution du fee (basis points sur 10000).
    uint256 public constant TREASURY_BPS = 7000;
    uint256 public constant ADMIN_BPS    = 2000;
    uint256 public constant BURN_BPS     = 1000;

    /// @notice Adresse de burn pour le 10 % détruit.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Frais en WTG natif pour créer un token. Modifiable par owner.
    uint256 public creationFee = 100 ether;

    /// @notice Treasury qui reçoit les 70 %.
    address public treasury;

    /// @notice Verification registry — appelée pour marquer le tier 1 (FactoryCreated).
    VerificationRegistry public verificationRegistry;

    /// @notice Liste blanche team WINTG (frais = 0).
    mapping(address => bool) public isTeamMember;

    /// @notice Tableau de tous les tokens déployés (lecture facile).
    address[] public tokens;

    /// @notice Mapping créateur → ses tokens.
    mapping(address => address[]) public tokensOfCreator;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 cap,
        uint256 initialSupply,
        bool hasVotes,
        bool isMintable,
        bool isSoulbound,
        string logoURI
    );

    event TeamMemberAdded(address indexed member);
    event TeamMemberRemoved(address indexed member);
    event CreationFeeChanged(uint256 newFee);
    event TreasuryChanged(address indexed previous, address indexed current);
    event VerificationRegistryChanged(address indexed previous, address indexed current);
    event FeeDistributed(uint256 toTreasury, uint256 toAdmin, uint256 toBurn);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidAddress();
    error WrongFee(uint256 sent, uint256 expected);
    error InvalidParams();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialTreasury, address initialRegistry) Ownable(initialOwner) {
        if (initialTreasury == address(0) || initialRegistry == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
        verificationRegistry = VerificationRegistry(initialRegistry);
        emit TreasuryChanged(address(0), initialTreasury);
        emit VerificationRegistryChanged(address(0), initialRegistry);
    }

    // -------------------------------------------------------------------------
    // External — token creation
    // -------------------------------------------------------------------------

    struct CreateParams {
        string name;
        string symbol;
        uint256 cap;             // 0 = pas de cap (utile uniquement si mintable)
        uint256 initialSupply;   // 0 autorisé (mais alors le créateur doit minter ensuite si mintable)
        bool hasVotes;
        bool isMintable;
        bool isSoulbound;
        string logoURI;          // optionnel
    }

    /**
     * @notice Crée un nouveau token ERC-20 sous les paramètres demandés.
     *         Les frais sont 100 WTG (gratuit si team WINTG). Le tier
     *         "FactoryCreated" est posé automatiquement.
     */
    function createToken(CreateParams calldata p) external payable nonReentrant returns (address tokenAddress) {
        // Validate params.
        if (bytes(p.name).length == 0 || bytes(p.symbol).length == 0) revert InvalidParams();

        bool free = isTeamMember[msg.sender];
        uint256 expectedFee = free ? 0 : creationFee;
        if (msg.value != expectedFee) revert WrongFee(msg.value, expectedFee);

        // Deploy token.
        SimpleERC20V2.Config memory cfg = SimpleERC20V2.Config({
            name:                 p.name,
            symbol:               p.symbol,
            cap_:                 p.cap,
            initialSupply:        p.initialSupply,
            admin:                msg.sender,
            isSoulbound:          p.isSoulbound,
            hasVotes:             p.hasVotes,
            isMintable:           p.isMintable,
            logoURI:              p.logoURI,
            verificationRegistry: address(verificationRegistry)
        });
        SimpleERC20V2 token = new SimpleERC20V2(cfg);
        tokenAddress = address(token);

        // Track.
        tokens.push(tokenAddress);
        tokensOfCreator[msg.sender].push(tokenAddress);

        // Mark FactoryCreated tier (badge bleu) via the registry.
        verificationRegistry.markFactoryCreated(tokenAddress);

        // Distribute fee if any.
        if (msg.value > 0) {
            _distributeFee(msg.value);
        }

        emit TokenCreated(
            tokenAddress, msg.sender, p.name, p.symbol, p.cap, p.initialSupply,
            p.hasVotes, p.isMintable, p.isSoulbound, p.logoURI
        );
    }

    // -------------------------------------------------------------------------
    // Owner — admin
    // -------------------------------------------------------------------------

    function addTeamMember(address member) external onlyOwner {
        if (member == address(0)) revert InvalidAddress();
        isTeamMember[member] = true;
        emit TeamMemberAdded(member);
    }

    function removeTeamMember(address member) external onlyOwner {
        isTeamMember[member] = false;
        emit TeamMemberRemoved(member);
    }

    function setCreationFee(uint256 newFee) external onlyOwner {
        creationFee = newFee;
        emit CreationFeeChanged(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function setVerificationRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert InvalidAddress();
        address previous = address(verificationRegistry);
        verificationRegistry = VerificationRegistry(newRegistry);
        emit VerificationRegistryChanged(previous, newRegistry);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function tokensCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokensOfCreatorCount(address creator) external view returns (uint256) {
        return tokensOfCreator[creator].length;
    }

    /// @notice Returns a paginated slice of all tokens (avoid huge arrays).
    function tokensSlice(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = tokens.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = tokens[i];
    }

    // -------------------------------------------------------------------------
    // Internal — fee distribution
    // -------------------------------------------------------------------------

    function _distributeFee(uint256 amount) internal {
        uint256 toTreasury = (amount * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (amount * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = amount - toTreasury - toAdmin;

        // Admin destination = verification admin from registry.
        address admin = verificationRegistry.verificationAdmin();

        _safeSend(payable(treasury),     toTreasury);
        _safeSend(payable(admin),        toAdmin);
        _safeSend(payable(BURN_ADDRESS), toBurn);

        emit FeeDistributed(toTreasury, toAdmin, toBurn);
    }

    function _safeSend(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
