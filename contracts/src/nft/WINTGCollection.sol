// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  WINTGCollection
 * @author WINTG Team
 * @notice Template ERC-1155 (multi-token) pour collections de NFT par lots,
 *         items de jeu, billets d'événements, etc.
 *         Inclut Pausable, Supply tracking, royalties EIP-2981, AccessControl.
 */
contract WINTGCollection is ERC1155, ERC1155Pausable, ERC1155Supply, ERC2981, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant URI_ROLE = keccak256("URI_ROLE");

    string public name;
    string public symbol;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory uri_,
        address admin,
        address royaltyReceiver,
        uint96 royaltyFeeBps
    ) ERC1155(uri_) {
        name = name_;
        symbol = symbol_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(URI_ROLE, admin);

        _setDefaultRoyalty(royaltyReceiver, royaltyFeeBps);
    }

    function mint(address to, uint256 id, uint256 amount, bytes calldata data)
        external onlyRole(MINTER_ROLE)
    {
        _mint(to, id, amount, data);
    }

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data)
        external onlyRole(MINTER_ROLE)
    {
        _mintBatch(to, ids, amounts, data);
    }

    function setURI(string calldata newuri) external onlyRole(URI_ROLE) {
        _setURI(newuri);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // -------------------------------------------------------------------------
    // OZ multiple-inheritance overrides
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Pausable, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, ERC2981, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
