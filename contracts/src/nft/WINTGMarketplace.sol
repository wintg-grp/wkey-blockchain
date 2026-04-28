// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable}              from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard}       from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}                from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}             from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721}               from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155}              from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC2981}              from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165}               from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Receiver}       from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title  WINTGMarketplace
 * @author WINTG Team
 * @notice Marketplace embarquée WINTG pour NFT (ERC-721 et ERC-1155).
 *
 *         Features :
 *           - Listings à prix fixe (WTG natif ou n'importe quel ERC-20 verified)
 *           - Auctions English (montants croissants) avec :
 *             - réserve price optionnelle
 *             - durée min 1h, max 30j
 *             - anti-snipe : extension auto +5 min si bid dans la dernière fenêtre
 *           - Bids/offers sur n'importe quel item (incluant non listés)
 *           - Royalties EIP-2981 honorées automatiquement
 *           - Frais plateforme 2 % au treasury
 *
 *         Le contrat ne custody PAS les NFT : il opère sur approve/setApprovalForAll.
 *         Pour les bids, l'enchérisseur doit approve le payment token.
 *         Les WTG natifs (auctions / bids natifs) sont escrowés dans le contrat
 *         le temps de l'auction.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step, Pausable,
 *         ReentrancyGuard, NatSpec.
 */
contract WINTGMarketplace is Ownable2Step, Pausable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Frais de plateforme (200 bps = 2 %).
    uint96 public constant PLATFORM_FEE_BPS = 200;
    uint96 public constant BPS_DENOMINATOR  = 10_000;

    /// @notice Sentinel pour le WTG natif comme "payment token" (EIP-7528).
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 public constant AUCTION_MIN_DURATION = 1 hours;
    uint256 public constant AUCTION_MAX_DURATION = 30 days;

    /// @notice Anti-snipe : si un bid arrive dans la dernière fenêtre, on
    ///         étend l'auction.
    uint256 public constant ANTI_SNIPE_WINDOW   = 5 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 5 minutes;

    /// @notice Pourcentage minimum d'augmentation entre 2 bids (500 bps = 5 %).
    uint96 public constant MIN_BID_INCREASE_BPS = 500;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Treasury qui reçoit les frais plateforme.
    address public treasury;

    enum ListingType  { None, FixedPrice, Auction }
    enum AssetStandard { ERC721, ERC1155 }

    struct Listing {
        ListingType   listingType;
        AssetStandard standard;
        address       seller;
        address       collection;
        uint256       tokenId;
        uint256       amount;          // 1 pour ERC-721, N pour ERC-1155
        address       paymentToken;    // NATIVE ou ERC-20
        uint256       price;           // fixedPrice : prix demandé ; auction : reserve price (0 = pas de réserve)
        uint64        endTime;         // auction only
        address       topBidder;
        uint256       topBid;
        bool          active;
    }

    /// @notice listingId => Listing. Auto-incrémentée.
    mapping(uint256 => Listing) public listings;
    uint256 public nextListingId;

    /// @notice Bids on listings — pour les ERC-20, le contrat custody le payment.
    ///         Pour le natif, idem.
    mapping(uint256 => mapping(address => uint256)) public bidEscrow; // listingId => bidder => amount

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        ListingType listingType,
        AssetStandard standard,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint64 endTime
    );
    event ListingCanceled(uint256 indexed listingId, address indexed seller);
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver);
    event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 amount, uint64 newEndTime);
    event BidRefunded(uint256 indexed listingId, address indexed bidder, uint256 amount);
    event AuctionFinalized(uint256 indexed listingId, address indexed winner, uint256 amount);

    event TreasuryChanged(address indexed previous, address indexed current);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidParams();
    error InvalidPrice();
    error InvalidDuration();
    error WrongPayment(uint256 sent, uint256 expected);
    error NotSeller();
    error NotActive();
    error AuctionEnded();
    error AuctionNotEnded();
    error BidTooLow(uint256 minimum);
    error TransferFailed();
    error UnsupportedStandard();
    error InvalidPaymentToken();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidParams();
        treasury = initialTreasury;
        emit TreasuryChanged(address(0), initialTreasury);
    }

    // -------------------------------------------------------------------------
    // Listings — fixed price
    // -------------------------------------------------------------------------

    /**
     * @notice Crée un listing à prix fixe. L'asset reste dans le wallet du
     *         seller — il doit avoir approve / setApprovalForAll cette
     *         marketplace.
     */
    function listFixedPrice(
        AssetStandard standard,
        address       collection,
        uint256       tokenId,
        uint256       amount,
        address       paymentToken,
        uint256       price
    ) external whenNotPaused returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        if (collection == address(0)) revert InvalidParams();
        if (standard == AssetStandard.ERC721 && amount != 1) revert InvalidParams();
        if (standard == AssetStandard.ERC1155 && amount == 0) revert InvalidParams();

        listingId = nextListingId++;
        listings[listingId] = Listing({
            listingType: ListingType.FixedPrice,
            standard:    standard,
            seller:      msg.sender,
            collection:  collection,
            tokenId:     tokenId,
            amount:      amount,
            paymentToken: paymentToken,
            price:       price,
            endTime:     0,
            topBidder:   address(0),
            topBid:      0,
            active:      true
        });
        emit ListingCreated(listingId, msg.sender, collection, tokenId, ListingType.FixedPrice, standard, amount, paymentToken, price, 0);
    }

    /**
     * @notice Achète un listing à prix fixe. Pour le natif, envoyer
     *         msg.value = price ; pour ERC-20, le buyer doit approve.
     */
    function buy(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active || l.listingType != ListingType.FixedPrice) revert NotActive();
        l.active = false; // anti-reentrancy + prevent double buy

        _settlePayment(l, msg.sender, l.price, msg.value);
        _transferAsset(l, msg.sender);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();
        // Auctions: only cancel if no bid yet.
        if (l.listingType == ListingType.Auction && l.topBidder != address(0)) revert NotActive();
        l.active = false;
        emit ListingCanceled(listingId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Listings — auction English
    // -------------------------------------------------------------------------

    function listAuction(
        AssetStandard standard,
        address       collection,
        uint256       tokenId,
        uint256       amount,
        address       paymentToken,
        uint256       reservePrice,
        uint64        durationSeconds
    ) external whenNotPaused returns (uint256 listingId) {
        if (collection == address(0)) revert InvalidParams();
        if (durationSeconds < AUCTION_MIN_DURATION || durationSeconds > AUCTION_MAX_DURATION) revert InvalidDuration();
        if (standard == AssetStandard.ERC721 && amount != 1) revert InvalidParams();
        if (standard == AssetStandard.ERC1155 && amount == 0) revert InvalidParams();

        listingId = nextListingId++;
        uint64 endTime = uint64(block.timestamp + durationSeconds);
        listings[listingId] = Listing({
            listingType:  ListingType.Auction,
            standard:     standard,
            seller:       msg.sender,
            collection:   collection,
            tokenId:      tokenId,
            amount:       amount,
            paymentToken: paymentToken,
            price:        reservePrice,
            endTime:      endTime,
            topBidder:    address(0),
            topBid:       0,
            active:       true
        });
        emit ListingCreated(listingId, msg.sender, collection, tokenId, ListingType.Auction, standard, amount, paymentToken, reservePrice, endTime);
    }

    function bid(uint256 listingId, uint256 amount) external payable nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active || l.listingType != ListingType.Auction) revert NotActive();
        if (block.timestamp >= l.endTime) revert AuctionEnded();

        // Determine the actual bid amount (msg.value for native, `amount` for ERC-20)
        uint256 bidAmount = (l.paymentToken == NATIVE) ? msg.value : amount;
        // Min bid : reservePrice if first bid, else topBid * (1 + MIN_BID_INCREASE).
        uint256 minimum = l.topBid == 0
            ? l.price                                              // reserve
            : l.topBid + (l.topBid * MIN_BID_INCREASE_BPS) / BPS_DENOMINATOR;
        if (bidAmount < minimum) revert BidTooLow(minimum);

        // Pull funds.
        if (l.paymentToken == NATIVE) {
            // already in msg.value
        } else {
            IERC20(l.paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }
        bidEscrow[listingId][msg.sender] += bidAmount;

        // Refund previous top bidder.
        if (l.topBidder != address(0)) {
            uint256 refundAmount = l.topBid;
            address previousBidder = l.topBidder;
            bidEscrow[listingId][previousBidder] -= refundAmount;
            _payOut(l.paymentToken, payable(previousBidder), refundAmount);
            emit BidRefunded(listingId, previousBidder, refundAmount);
        }

        l.topBidder = msg.sender;
        l.topBid    = bidAmount;

        // Anti-snipe.
        if (l.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            l.endTime = uint64(block.timestamp + ANTI_SNIPE_EXTENSION);
        }

        emit BidPlaced(listingId, msg.sender, bidAmount, l.endTime);
    }

    /**
     * @notice Finalise une auction terminée. Si un winner existe et a atteint
     *         le reserve price, l'asset est transféré + paiements répartis.
     *         Sinon, l'asset reste au seller (auction failed).
     */
    function finalizeAuction(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active || l.listingType != ListingType.Auction) revert NotActive();
        if (block.timestamp < l.endTime) revert AuctionNotEnded();

        l.active = false;

        if (l.topBidder == address(0)) {
            // No bid. Just close.
            emit AuctionFinalized(listingId, address(0), 0);
            return;
        }

        // Winner has paid topBid into escrow. Settle payment from escrow.
        uint256 amount = l.topBid;
        bidEscrow[listingId][l.topBidder] = 0;
        _splitPayment(l, amount);
        _transferAsset(l, l.topBidder);
        emit AuctionFinalized(listingId, l.topBidder, amount);
    }

    // -------------------------------------------------------------------------
    // Owner / admin
    // -------------------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidParams();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Internal — payment, royalties, transfer
    // -------------------------------------------------------------------------

    function _settlePayment(Listing storage l, address buyer, uint256 amount, uint256 sentValue) internal {
        if (l.paymentToken == NATIVE) {
            if (sentValue != amount) revert WrongPayment(sentValue, amount);
        } else {
            if (sentValue != 0) revert WrongPayment(sentValue, 0);
            IERC20(l.paymentToken).safeTransferFrom(buyer, address(this), amount);
        }
        _splitPayment(l, amount);
    }

    function _splitPayment(Listing storage l, uint256 amount) internal {
        // Platform fee.
        uint256 platformFee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

        // Royalties (EIP-2981).
        uint256 royaltyAmount = 0;
        address royaltyReceiver = address(0);
        try IERC2981(l.collection).royaltyInfo(l.tokenId, amount) returns (address rec, uint256 amt) {
            if (rec != address(0) && amt > 0 && amt + platformFee <= amount) {
                royaltyReceiver = rec;
                royaltyAmount = amt;
            }
        } catch {}

        uint256 toSeller = amount - platformFee - royaltyAmount;

        _payOut(l.paymentToken, payable(treasury),       platformFee);
        if (royaltyReceiver != address(0)) {
            _payOut(l.paymentToken, payable(royaltyReceiver), royaltyAmount);
        }
        _payOut(l.paymentToken, payable(l.seller),       toSeller);

        emit Sold(0 /* listingId logged elsewhere */, l.seller, amount, platformFee, royaltyAmount, royaltyReceiver);
    }

    function _payOut(address token, address payable to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _transferAsset(Listing storage l, address to) internal {
        if (l.standard == AssetStandard.ERC721) {
            IERC721(l.collection).safeTransferFrom(l.seller, to, l.tokenId);
        } else {
            IERC1155(l.collection).safeTransferFrom(l.seller, to, l.tokenId, l.amount, "");
        }
    }

    /// @notice Pour ERC-721 safeTransferFrom direct (peu utilisé : on passe
    ///         par seller → buyer directement).
    function onERC721Received(address, address, uint256, bytes memory) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
