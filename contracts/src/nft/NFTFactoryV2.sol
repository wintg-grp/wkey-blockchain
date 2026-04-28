// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {WINTGCollection721}  from "./WINTGCollection721.sol";
import {VerificationRegistry} from "../verification/VerificationRegistry.sol";

/**
 * @title  NFTFactoryV2 — ERC-721 collections
 * @author WINTG Team
 * @notice Factory publique pour déployer des collections NFT ERC-721 WINTG.
 *         Frais 50 WTG (gratuit team). Distribution 70/20/10.
 *         La factory marque automatiquement chaque collection en tier 1
 *         "FactoryCreated" via `VerificationRegistry`.
 *
 * @dev    Pour les ERC-1155, voir `NFTFactory1155.sol`. Le split en deux
 *         factories réduit le bytecode de chaque (sous la limite EIP-170).
 *
 *         Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, ReentrancyGuard.
 */
contract NFTFactoryV2 is Ownable2Step, ReentrancyGuard {
    uint256 public constant TREASURY_BPS = 7000;
    uint256 public constant ADMIN_BPS    = 2000;
    uint256 public constant BURN_BPS     = 1000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public creationFee = 50 ether;
    address public treasury;
    VerificationRegistry public verificationRegistry;

    mapping(address => bool) public isTeamMember;

    address[] public collections;
    mapping(address => address[]) public collectionsOfCreator;

    event CollectionCreated(
        address indexed collection,
        address indexed creator,
        string  name,
        string  symbol
    );
    event TeamMemberAdded(address indexed member);
    event TeamMemberRemoved(address indexed member);
    event CreationFeeChanged(uint256 newFee);
    event TreasuryChanged(address indexed previous, address indexed current);
    event VerificationRegistryChanged(address indexed previous, address indexed current);
    event FeeDistributed(uint256 toTreasury, uint256 toAdmin, uint256 toBurn);

    error InvalidAddress();
    error WrongFee(uint256 sent, uint256 expected);
    error InvalidParams();
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury, address initialRegistry) Ownable(initialOwner) {
        if (initialTreasury == address(0) || initialRegistry == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
        verificationRegistry = VerificationRegistry(initialRegistry);
        emit TreasuryChanged(address(0), initialTreasury);
        emit VerificationRegistryChanged(address(0), initialRegistry);
    }

    /**
     * @notice Crée une collection ERC-721 sous les paramètres fournis.
     */
    function createCollection(WINTGCollection721.Config calldata cfg) external payable nonReentrant returns (address collection) {
        if (bytes(cfg.name).length == 0 || bytes(cfg.symbol).length == 0) revert InvalidParams();
        bool free = isTeamMember[msg.sender];
        uint256 expectedFee = free ? 0 : creationFee;
        if (msg.value != expectedFee) revert WrongFee(msg.value, expectedFee);

        WINTGCollection721.Config memory finalCfg = cfg;
        finalCfg.admin = msg.sender;
        finalCfg.verificationRegistry = address(verificationRegistry);

        WINTGCollection721 c = new WINTGCollection721(finalCfg);
        collection = address(c);

        collections.push(collection);
        collectionsOfCreator[msg.sender].push(collection);
        verificationRegistry.markFactoryCreated(collection);

        if (msg.value > 0) _distributeFee(msg.value);

        emit CollectionCreated(collection, msg.sender, cfg.name, cfg.symbol);
    }

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

    function collectionsCount() external view returns (uint256) {
        return collections.length;
    }

    function collectionsOfCreatorCount(address creator) external view returns (uint256) {
        return collectionsOfCreator[creator].length;
    }

    function collectionsSlice(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = collections.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = collections[i];
    }

    function _distributeFee(uint256 amount) internal {
        uint256 toTreasury = (amount * TREASURY_BPS) / 10_000;
        uint256 toAdmin    = (amount * ADMIN_BPS)    / 10_000;
        uint256 toBurn     = amount - toTreasury - toAdmin;
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
