// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {StableERC20} from "./StableERC20.sol";

/**
 * @title  WCFAToken (WCFA)
 * @author WINTG Team
 * @notice Stablecoin franc CFA (XOF) officiel WINTG. Différenciateur
 *         majeur pour le marché UEMOA — paiements quotidiens en CFA
 *         on-chain, gasless via EIP-3009 + relayer WINTG.
 *
 *         Pegged à 1 WCFA = 1 XOF via le `WCFAVault` (Batch 5 DeFi)
 *         qui détient le rôle MINTER_ROLE.
 *
 * @dev    Voir USDWToken pour le modèle MINTER_ROLE.
 */
contract WCFAToken is StableERC20 {
    constructor(address admin_, address registry_, string memory logoURI_)
        StableERC20("CFA WINTG", "WCFA", admin_, registry_, logoURI_)
    {}
}
