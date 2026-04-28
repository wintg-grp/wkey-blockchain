// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {StableERC20} from "./StableERC20.sol";

/**
 * @title  USDWToken (USDW)
 * @author WINTG Team
 * @notice Stablecoin USD officiel WINTG.
 *         Pegged à 1 USDW = 1 USD via le `USDWVault` (Batch 5 DeFi)
 *         qui détient le rôle MINTER_ROLE.
 *
 * @dev    Pour la phase 1.7, le `admin` détient temporairement le
 *         MINTER_ROLE. Au déploiement du Vault (Batch 5), l'admin
 *         transférera ce rôle au contrat Vault et ne le gardera plus.
 */
contract USDWToken is StableERC20 {
    constructor(address admin_, address registry_, string memory logoURI_)
        StableERC20("USD WINTG", "USDW", admin_, registry_, logoURI_)
    {}
}
