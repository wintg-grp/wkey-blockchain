// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC721}        from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC2981}       from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165}       from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC4906}      from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {Strings}       from "@openzeppelin/contracts/utils/Strings.sol";

import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  WINTGCollection721
 * @author WINTG Team
 * @notice Collection NFT ERC-721 polyvalente déployée via la `NFTFactoryV2`.
 *
 *         Features intégrées (toutes activables au déploiement) :
 *           - logoURI (collection-level) + contractURI (OpenSea-compatible)
 *           - tokenURI par item (mode "individual") OU baseURI commune
 *           - EIP-2981 royalties (max 15 %)
 *           - Freeze indépendant : contractURI / tokenURIs (irréversibles)
 *           - ERC-4906 events `MetadataUpdate` automatiques
 *           - Soulbound opt-in (transferts désactivés)
 *           - Burn par holder + révocation par MINTER_ROLE (avec event public)
 *           - Verification tier (None / FactoryCreated / WintgVerified / Official)
 *           - Enumerable (utile pour wallets / explorers)
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, AccessControl, NatSpec.
 */
contract WINTGCollection721 is
    ERC721,
    ERC721Enumerable,
    ERC721Burnable,
    ERC2981,
    AccessControl,
    IERC4906,
    IVerifiableAsset
{
    using Strings for uint256;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Royalty max acceptée (en basis points, 1500 = 15 %).
    uint96 public constant MAX_ROYALTY_BPS = 1500;

    /// @notice Bornes d'URI (collection / item / contractURI).
    uint256 public constant URI_MIN = 7;
    uint256 public constant URI_MAX = 256;

    // -------------------------------------------------------------------------
    // Storage — features
    // -------------------------------------------------------------------------

    /// @notice Si true, transferts désactivés (soulbound).
    bool public immutable isSoulbound;

    /// @notice Si true, le mode est "baseURI" : tokenURI(id) = baseURI + id.
    ///         Si false, mode "individual" : chaque tokenId a son URI custom.
    bool public immutable usesBaseURI;

    // -------------------------------------------------------------------------
    // Storage — URIs & freezes
    // -------------------------------------------------------------------------

    string private _contractURI;
    string private _collectionLogoURI;
    string private _baseURIStorage;

    /// @dev mode individual only.
    mapping(uint256 => string) private _tokenURIs;

    bool public contractURIFrozen;
    bool public allTokenURIsFrozen;

    // -------------------------------------------------------------------------
    // Storage — verification tier
    // -------------------------------------------------------------------------

    Tier public verificationTier;

    address public immutable verificationRegistry;

    // -------------------------------------------------------------------------
    // Storage — counters
    // -------------------------------------------------------------------------

    /// @notice Prochaine tokenId à minter (auto-incrémentée).
    uint256 public nextTokenId;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ContractURIUpdated();
    event CollectionLogoURIUpdated(string newURI);
    event ContractURIFrozenEvent();
    event AllTokenURIsFrozenEvent();
    event Revoked(address indexed holder, uint256 indexed tokenId, string reason, string ipfsURI);

    event VerificationTierUpdated(Tier indexed previous, Tier indexed current);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error SoulboundLocked();
    error ContractURIFrozenError();
    error AllTokenURIsFrozenError();
    error WrongModeIndividualOnly();
    error WrongModeBaseURIOnly();
    error InvalidURI();
    error RoyaltyTooHigh(uint96 bps);
    error NotVerificationRegistry();
    error TokenDoesNotExist(uint256 tokenId);

    // -------------------------------------------------------------------------
    // Constructor (param struct to avoid stack-too-deep)
    // -------------------------------------------------------------------------

    struct Config {
        string  name;
        string  symbol;
        address admin;
        bool    isSoulbound;
        bool    usesBaseURI;
        string  baseURI;            // utilisé seulement si usesBaseURI = true
        string  contractURI_;       // optionnel
        string  collectionLogoURI_; // optionnel
        address royaltyReceiver;    // 0x0 = pas de royalty par défaut
        uint96  royaltyBps;
        address verificationRegistry;
    }

    constructor(Config memory cfg) ERC721(cfg.name, cfg.symbol) {
        isSoulbound = cfg.isSoulbound;
        usesBaseURI = cfg.usesBaseURI;
        verificationRegistry = cfg.verificationRegistry;

        if (cfg.usesBaseURI && bytes(cfg.baseURI).length > 0) {
            _baseURIStorage = cfg.baseURI;
        }

        if (bytes(cfg.contractURI_).length > 0) {
            _validateURI(cfg.contractURI_);
            _contractURI = cfg.contractURI_;
            emit ContractURIUpdated();
        }
        if (bytes(cfg.collectionLogoURI_).length > 0) {
            _validateURI(cfg.collectionLogoURI_);
            _collectionLogoURI = cfg.collectionLogoURI_;
            emit CollectionLogoURIUpdated(cfg.collectionLogoURI_);
        }

        if (cfg.royaltyReceiver != address(0) && cfg.royaltyBps > 0) {
            if (cfg.royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(cfg.royaltyBps);
            _setDefaultRoyalty(cfg.royaltyReceiver, cfg.royaltyBps);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, cfg.admin);
        _grantRole(MINTER_ROLE,        cfg.admin);
    }

    // -------------------------------------------------------------------------
    // Mint
    // -------------------------------------------------------------------------

    /**
     * @notice Mint un NFT au destinataire (mode individuel : on fournit
     *         l'URI ; mode baseURI : URI = baseURI + tokenId).
     */
    function mint(address to, string calldata uri_) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        if (!usesBaseURI) {
            if (bytes(uri_).length > 0) {
                _validateURI(uri_);
                _tokenURIs[tokenId] = uri_;
            }
        }
        // Pas besoin d'event MetadataUpdate au mint — le marketplace écoute Transfer.
    }

    /**
     * @notice Mint plusieurs items en 1 tx (utile pour drops). En mode
     *         individuel, les URIs ont la même longueur que `recipients`.
     *         En mode baseURI, on ignore le tableau `uris`.
     */
    function mintBatch(address[] calldata recipients, string[] calldata uris) external onlyRole(MINTER_ROLE) returns (uint256 firstId) {
        if (!usesBaseURI && recipients.length != uris.length) revert InvalidURI();
        firstId = nextTokenId;
        for (uint256 i; i < recipients.length; ++i) {
            uint256 tid = nextTokenId++;
            _safeMint(recipients[i], tid);
            if (!usesBaseURI && bytes(uris[i]).length > 0) {
                _validateURI(uris[i]);
                _tokenURIs[tid] = uris[i];
            }
        }
    }

    // -------------------------------------------------------------------------
    // tokenURI logic
    // -------------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (usesBaseURI) {
            return bytes(_baseURIStorage).length > 0 ? string.concat(_baseURIStorage, tokenId.toString()) : "";
        }
        return _tokenURIs[tokenId];
    }

    /// @notice Set the URI for a specific token (individual mode only).
    function setTokenURI(uint256 tokenId, string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (allTokenURIsFrozen) revert AllTokenURIsFrozenError();
        if (usesBaseURI) revert WrongModeIndividualOnly();
        _requireOwned(tokenId);
        _validateURI(uri_);
        _tokenURIs[tokenId] = uri_;
        emit MetadataUpdate(tokenId);
    }

    /// @notice Update the base URI (baseURI mode only). Affects all tokens.
    function setBaseURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (allTokenURIsFrozen) revert AllTokenURIsFrozenError();
        if (!usesBaseURI) revert WrongModeBaseURIOnly();
        _baseURIStorage = uri_;
        if (nextTokenId > 0) emit BatchMetadataUpdate(0, nextTokenId - 1);
    }

    // -------------------------------------------------------------------------
    // contractURI / collectionLogoURI
    // -------------------------------------------------------------------------

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function collectionLogoURI() external view returns (string memory) {
        return _collectionLogoURI;
    }

    function setContractURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (contractURIFrozen) revert ContractURIFrozenError();
        _validateURI(uri_);
        _contractURI = uri_;
        emit ContractURIUpdated();
    }

    function setCollectionLogoURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (contractURIFrozen) revert ContractURIFrozenError();
        _validateURI(uri_);
        _collectionLogoURI = uri_;
        emit CollectionLogoURIUpdated(uri_);
    }

    function freezeContractURI() external onlyRole(DEFAULT_ADMIN_ROLE) {
        contractURIFrozen = true;
        emit ContractURIFrozenEvent();
    }

    function freezeAllTokenURIs() external onlyRole(DEFAULT_ADMIN_ROLE) {
        allTokenURIsFrozen = true;
        emit AllTokenURIsFrozenEvent();
    }

    // -------------------------------------------------------------------------
    // Royalties (EIP-2981)
    // -------------------------------------------------------------------------

    function setDefaultRoyalty(address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setDefaultRoyalty(receiver, bps);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setTokenRoyalty(tokenId, receiver, bps);
    }

    function deleteDefaultRoyalty() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _deleteDefaultRoyalty();
    }

    // -------------------------------------------------------------------------
    // Verification tier — IVerifiableAsset
    // -------------------------------------------------------------------------

    function setVerificationTier(Tier newTier) external override {
        if (msg.sender != verificationRegistry) revert NotVerificationRegistry();
        Tier prev = verificationTier;
        verificationTier = newTier;
        emit VerificationTierUpdated(prev, newTier);
    }

    // -------------------------------------------------------------------------
    // Soulbound + revocation
    // -------------------------------------------------------------------------

    /**
     * @notice Burn par MINTER_ROLE (révocation d'un credential soulbound).
     *         Event public + IPFS report obligatoire pour transparence.
     */
    function burnFrom(uint256 tokenId, string calldata reason, string calldata ipfsURI) external onlyRole(MINTER_ROLE) {
        if (bytes(ipfsURI).length < URI_MIN) revert InvalidURI();
        address holder = _ownerOf(tokenId);
        if (holder == address(0)) revert TokenDoesNotExist(tokenId);
        _burn(tokenId);
        emit Revoked(holder, tokenId, reason, ipfsURI);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _validateURI(string memory u) internal pure {
        uint256 len = bytes(u).length;
        if (len < URI_MIN || len > URI_MAX) revert InvalidURI();
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIStorage;
    }

    /// @dev Soulbound : block transferts user-to-user. Mint et burn passent.
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        address from = _ownerOf(tokenId);
        if (isSoulbound && from != address(0) && to != address(0)) revert SoulboundLocked();
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    // -------------------------------------------------------------------------
    // ERC165
    // -------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC2981, AccessControl, IERC165)
        returns (bool)
    {
        // 0x49064906 = ERC-4906
        return
            interfaceId == bytes4(0x49064906) ||
            super.supportsInterface(interfaceId);
    }
}
