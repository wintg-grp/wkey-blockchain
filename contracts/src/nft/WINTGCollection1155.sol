// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC1155}       from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981}       from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  WINTGCollection1155
 * @author WINTG Team
 * @notice Collection NFT ERC-1155 (semi-fungible) déployée via la
 *         `NFTFactoryV2`. Variante de WINTGCollection721 adaptée aux
 *         multi-éditions par item.
 *
 *         Mêmes features (logoURI, contractURI, royalties, freeze, soulbound,
 *         dynamic via ERC-4906, verification tier).
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, AccessControl, NatSpec.
 */
contract WINTGCollection1155 is
    ERC1155,
    ERC1155Burnable,
    ERC1155Supply,
    ERC2981,
    AccessControl,
    IVerifiableAsset
{
    /// @dev ERC-4906 events (manually declared because IERC4906 extends IERC721
    ///      which is incompatible with ERC1155 inheritance).
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint96  public constant MAX_ROYALTY_BPS = 1500;
    uint256 public constant URI_MIN = 7;
    uint256 public constant URI_MAX = 256;

    string public name;
    string public symbol;

    bool public immutable isSoulbound;

    string private _contractURI;
    string private _collectionLogoURI;

    /// @dev tokenId => uri (mode override). Si vide, fallback to base ERC1155 uri().
    mapping(uint256 => string) private _tokenURIs;

    bool public contractURIFrozen;
    bool public allTokenURIsFrozen;

    Tier public verificationTier;
    address public immutable verificationRegistry;

    event ContractURIUpdated();
    event CollectionLogoURIUpdated(string newURI);
    event ContractURIFrozenEvent();
    event AllTokenURIsFrozenEvent();
    event Revoked(address indexed holder, uint256 indexed tokenId, uint256 amount, string reason, string ipfsURI);
    event VerificationTierUpdated(Tier indexed previous, Tier indexed current);

    error SoulboundLocked();
    error ContractURIFrozenError();
    error AllTokenURIsFrozenError();
    error InvalidURI();
    error RoyaltyTooHigh(uint96 bps);
    error NotVerificationRegistry();

    struct Config {
        string  name;
        string  symbol;
        address admin;
        bool    isSoulbound;
        string  baseURI;            // ERC1155 standard `uri(tokenId)` template (e.g. "ipfs://Qm.../{id}.json")
        string  contractURI_;
        string  collectionLogoURI_;
        address royaltyReceiver;
        uint96  royaltyBps;
        address verificationRegistry;
    }

    constructor(Config memory cfg) ERC1155(cfg.baseURI) {
        name = cfg.name;
        symbol = cfg.symbol;
        isSoulbound = cfg.isSoulbound;
        verificationRegistry = cfg.verificationRegistry;

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

    function mint(address to, uint256 id, uint256 amount, bytes calldata data) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
    }

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external onlyRole(MINTER_ROLE) {
        _mintBatch(to, ids, amounts, data);
    }

    // -------------------------------------------------------------------------
    // URIs
    // -------------------------------------------------------------------------

    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory custom = _tokenURIs[tokenId];
        return bytes(custom).length > 0 ? custom : super.uri(tokenId);
    }

    function setBaseURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (allTokenURIsFrozen) revert AllTokenURIsFrozenError();
        _setURI(uri_);
        // ERC-4906 batch update (range [0, max uint256] is the convention for "all")
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    function setTokenURI(uint256 tokenId, string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (allTokenURIsFrozen) revert AllTokenURIsFrozenError();
        _validateURI(uri_);
        _tokenURIs[tokenId] = uri_;
        emit MetadataUpdate(tokenId);
    }

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
    // Royalties
    // -------------------------------------------------------------------------

    function setDefaultRoyalty(address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setDefaultRoyalty(receiver, bps);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setTokenRoyalty(tokenId, receiver, bps);
    }

    // -------------------------------------------------------------------------
    // Verification tier
    // -------------------------------------------------------------------------

    function setVerificationTier(Tier newTier) external override {
        if (msg.sender != verificationRegistry) revert NotVerificationRegistry();
        Tier prev = verificationTier;
        verificationTier = newTier;
        emit VerificationTierUpdated(prev, newTier);
    }

    // -------------------------------------------------------------------------
    // Revocation (soulbound)
    // -------------------------------------------------------------------------

    function burnFromAdmin(address holder, uint256 id, uint256 amount, string calldata reason, string calldata ipfsURI) external onlyRole(MINTER_ROLE) {
        if (bytes(ipfsURI).length < URI_MIN) revert InvalidURI();
        _burn(holder, id, amount);
        emit Revoked(holder, id, amount, reason, ipfsURI);
    }

    // -------------------------------------------------------------------------
    // Internal — soulbound enforcement + supply tracking
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Supply)
    {
        if (isSoulbound && from != address(0) && to != address(0)) revert SoulboundLocked();
        super._update(from, to, ids, values);
    }

    function _validateURI(string memory u) internal pure {
        uint256 len = bytes(u).length;
        if (len < URI_MIN || len > URI_MAX) revert InvalidURI();
    }

    // -------------------------------------------------------------------------
    // ERC165
    // -------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, ERC2981, AccessControl) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
