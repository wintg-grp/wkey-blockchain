// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {WINTGNFT} from "./WINTGNFT.sol";
import {WINTGCollection} from "./WINTGCollection.sol";

/**
 * @title  NFTFactory
 * @author WINTG Team
 * @notice Crée des collections NFT (ERC-721 via `WINTGNFT`, ERC-1155 via
 *         `WINTGCollection`) contre un frais fixe en WTG versé à la Trésorerie.
 *
 *         **Frais par défaut : 50 WTG par création** (modifiable par DAO).
 *         Les deux types ont le même prix car même complexité business.
 */
contract NFTFactory is Ownable2Step, ReentrancyGuard, Pausable {
    using Address for address payable;

    uint256 public constant MAX_FEE = 10_000 ether;

    enum CollectionType { ERC721, ERC1155 }

    address payable public treasury;
    uint256 public erc721Fee;
    uint256 public erc1155Fee;

    address[] public allCollections;
    mapping(address => address[]) public collectionsByCreator;
    mapping(address => CollectionType) public typeOf;

    event CollectionCreated(
        address indexed creator,
        address indexed collection,
        CollectionType indexed kind,
        string name,
        string symbol,
        uint256 feePaid
    );
    event FeesUpdated(uint256 erc721Fee, uint256 erc1155Fee);
    event TreasuryUpdated(address indexed treasury);

    error InsufficientFee(uint256 required, uint256 sent);
    error FeeTooHigh(uint256 requested, uint256 max);
    error ZeroAddress();
    error EmptyName();

    constructor(
        address initialOwner_,
        address payable treasury_,
        uint256 erc721Fee_,
        uint256 erc1155Fee_
    ) Ownable(initialOwner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (erc721Fee_ > MAX_FEE) revert FeeTooHigh(erc721Fee_, MAX_FEE);
        if (erc1155Fee_ > MAX_FEE) revert FeeTooHigh(erc1155Fee_, MAX_FEE);
        treasury = treasury_;
        erc721Fee = erc721Fee_;
        erc1155Fee = erc1155Fee_;
    }

    function createERC721(
        string calldata name,
        string calldata symbol,
        address royaltyReceiver,
        uint96  royaltyFeeBps
    ) external payable nonReentrant whenNotPaused returns (address collection) {
        if (msg.value < erc721Fee) revert InsufficientFee(erc721Fee, msg.value);
        if (bytes(name).length == 0) revert EmptyName();
        if (royaltyReceiver == address(0)) revert ZeroAddress();

        WINTGNFT c = new WINTGNFT(name, symbol, msg.sender, royaltyReceiver, royaltyFeeBps);
        collection = address(c);

        allCollections.push(collection);
        collectionsByCreator[msg.sender].push(collection);
        typeOf[collection] = CollectionType.ERC721;

        emit CollectionCreated(msg.sender, collection, CollectionType.ERC721, name, symbol, erc721Fee);
        _payFeeAndRefund(erc721Fee);
    }

    function createERC1155(
        string calldata name,
        string calldata symbol,
        string calldata uri,
        address royaltyReceiver,
        uint96  royaltyFeeBps
    ) external payable nonReentrant whenNotPaused returns (address collection) {
        if (msg.value < erc1155Fee) revert InsufficientFee(erc1155Fee, msg.value);
        if (bytes(name).length == 0) revert EmptyName();
        if (royaltyReceiver == address(0)) revert ZeroAddress();

        WINTGCollection c = new WINTGCollection(name, symbol, uri, msg.sender, royaltyReceiver, royaltyFeeBps);
        collection = address(c);

        allCollections.push(collection);
        collectionsByCreator[msg.sender].push(collection);
        typeOf[collection] = CollectionType.ERC1155;

        emit CollectionCreated(msg.sender, collection, CollectionType.ERC1155, name, symbol, erc1155Fee);
        _payFeeAndRefund(erc1155Fee);
    }

    function setFees(uint256 newErc721, uint256 newErc1155) external onlyOwner {
        if (newErc721 > MAX_FEE) revert FeeTooHigh(newErc721, MAX_FEE);
        if (newErc1155 > MAX_FEE) revert FeeTooHigh(newErc1155, MAX_FEE);
        erc721Fee = newErc721;
        erc1155Fee = newErc1155;
        emit FeesUpdated(newErc721, newErc1155);
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function totalCollections() external view returns (uint256) {
        return allCollections.length;
    }

    function collectionsByCreatorCount(address creator) external view returns (uint256) {
        return collectionsByCreator[creator].length;
    }

    function _payFeeAndRefund(uint256 feeAmount) internal {
        if (feeAmount > 0) treasury.sendValue(feeAmount);
        if (msg.value > feeAmount) {
            payable(msg.sender).sendValue(msg.value - feeAmount);
        }
    }
}
