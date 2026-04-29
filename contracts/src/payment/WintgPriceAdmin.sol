// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title  WintgPriceAdmin
 * @author WINTG Team
 * @notice Source unique des prix administrés des tokens WINTG dans la
 *         phase Pre-DEX. Tant qu'aucune pool DEX n'existe, le prix est
 *         déterminé ici par le multisig et utilisé par tous les contrats
 *         (subscription, ICO, paymaster) qui ont besoin d'un prix.
 *
 *         Prix initial fixé :
 *           - 1 WTG  = 50 CFA
 *           - 1 WKEY = 20 CFA
 *           - 1 USDW = 600 CFA (1 USD)
 *           - 1 WCFA = 1 CFA
 *
 *         Plus tard (Phase 2), une pool DEX live sera créée. À ce moment :
 *           - soit on garde le prix admin (cohérence)
 *           - soit on bascule vers un oracle DEX (TWAP)
 *           Le multisig décidera au cas par cas.
 *
 * @dev    Conforme WINTG : Apache-2.0, OZ v5, Ownable2Step.
 *         Tous les prix sont en CFA × 10^4 (4 décimales) pour la précision.
 *         Ex: 50 CFA → 500_000.
 */
contract WintgPriceAdmin is Ownable2Step {
    /// @notice Multiplicateur de précision (4 décimales).
    uint256 public constant PRICE_DECIMALS = 1e4;

    /// @notice Prix de chaque token en CFA × 10^4.
    /// @dev    Ex: 1 WTG = 50 CFA → priceCFA[wtg] = 500_000
    mapping(address => uint256) public priceCFA;

    event PriceUpdated(address indexed token, uint256 oldPriceCFA, uint256 newPriceCFA);

    error InvalidPrice();
    error TokenNotPriced();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Set the CFA price of a token (CFA × 10^4).
    function setPrice(address token, uint256 newPriceCFA) external onlyOwner {
        if (token == address(0) || newPriceCFA == 0) revert InvalidPrice();
        uint256 old = priceCFA[token];
        priceCFA[token] = newPriceCFA;
        emit PriceUpdated(token, old, newPriceCFA);
    }

    /// @notice Set multiple token prices in one tx.
    function setPriceBatch(address[] calldata tokens, uint256[] calldata pricesCFA) external onlyOwner {
        if (tokens.length != pricesCFA.length) revert InvalidPrice();
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i] == address(0) || pricesCFA[i] == 0) revert InvalidPrice();
            uint256 old = priceCFA[tokens[i]];
            priceCFA[tokens[i]] = pricesCFA[i];
            emit PriceUpdated(tokens[i], old, pricesCFA[i]);
        }
    }

    /**
     * @notice Convert a CFA amount into a token amount (in wei units).
     * @dev    `amountCFA` is in plain CFA (no decimals).
     *         `tokenAmount` is in wei (10^18 units), assuming token has 18 decimals.
     *
     * Example: convertCfaToToken(WTG, 9000) returns 180e18 (180 WTG)
     */
    function convertCfaToToken(address token, uint256 amountCFA) external view returns (uint256 tokenAmount) {
        uint256 p = priceCFA[token];
        if (p == 0) revert TokenNotPriced();
        // amountCFA is in CFA, priceCFA is CFA × 10^4 (= price per 1e18 wei of token)
        // tokenAmount in wei = amountCFA × PRICE_DECIMALS × 10^18 / priceCFA
        tokenAmount = (amountCFA * PRICE_DECIMALS * 1e18) / p;
    }

    /// @notice Convert a token amount (in wei) into CFA equivalent.
    function convertTokenToCfa(address token, uint256 tokenAmountWei) external view returns (uint256 amountCFA) {
        uint256 p = priceCFA[token];
        if (p == 0) revert TokenNotPriced();
        amountCFA = (tokenAmountWei * p) / (PRICE_DECIMALS * 1e18);
    }
}
