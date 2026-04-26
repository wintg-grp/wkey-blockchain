// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  WINTGNFT
 * @author WINTG Team
 * @notice Implémentation ERC-721 production-ready avec :
 *         - Enumeration (`tokenOfOwnerByIndex`)
 *         - URI storage par token (metadata mutable)
 *         - Pausable (urgence)
 *         - Royalties EIP-2981 (compatible OpenSea / NFT marketplaces)
 *         - AccessControl multi-rôle (MINTER_ROLE, PAUSER_ROLE)
 *
 *         Sert de **template canonique** pour les créateurs souhaitant
 *         déployer leur collection sur WINTG. Un dApp NFT marketplace
 *         (séparé) consommera cette interface.
 */
contract WINTGNFT is ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Pausable, ERC2981, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ROYALTY_ROLE = keccak256("ROYALTY_ROLE");

    uint256 private _nextTokenId;

    constructor(
        string memory name_,
        string memory symbol_,
        address admin,
        address royaltyReceiver,
        uint96 royaltyFeeBps     // ex: 500 = 5 %
    ) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(ROYALTY_ROLE, admin);

        _setDefaultRoyalty(royaltyReceiver, royaltyFeeBps);
    }

    function mint(address to, string calldata tokenUri)
        external onlyRole(MINTER_ROLE) returns (uint256 tokenId)
    {
        tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);
    }

    function batchMint(address[] calldata recipients, string[] calldata tokenUris)
        external onlyRole(MINTER_ROLE)
    {
        require(recipients.length == tokenUris.length, "WINTGNFT: length");
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = ++_nextTokenId;
            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, tokenUris[i]);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function setDefaultRoyalty(address receiver, uint96 feeBps) external onlyRole(ROYALTY_ROLE) {
        _setDefaultRoyalty(receiver, feeBps);
    }
    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeBps)
        external onlyRole(ROYALTY_ROLE)
    {
        _setTokenRoyalty(tokenId, receiver, feeBps);
    }

    // -------------------------------------------------------------------------
    // OZ multiple-inheritance overrides
    // -------------------------------------------------------------------------

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable, ERC721Pausable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
