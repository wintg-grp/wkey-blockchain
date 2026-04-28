// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {SimpleERC20V2} from "./SimpleERC20V2.sol";
import {IVerifiableAsset} from "../verification/VerificationRegistry.sol";

/**
 * @title  WKEYToken (WKEY)
 * @author WINTG Team
 * @notice Token utility de l'écosystème wallet WINTG WKey.
 *
 *         Configuration WINTG officielle :
 *           - Nom : WKEY
 *           - Symbole : WKEY
 *           - Supply max (cap) : 100 000 000 WKEY
 *           - Initial supply au déploiement : 30 000 000 WKEY
 *           - Mintable progressif (cap décroissable seulement)
 *           - ERC20Votes activé (gouvernance écosystème wallet)
 *           - Permit + EIP-3009 + airdrop natif (héritage SimpleERC20V2)
 *           - Verification tier posée à WintgOfficial après déploiement
 *
 *         Distribution initiale (à la création) :
 *           - 30M minté sur le compte ecosystem (admin)
 *           - 70M restants à minter au fil du temps via DAO + staking pool
 *             (programmes de fidélité, parrainage, rewards staking, etc.)
 *
 * @dev    C'est un thin wrapper de SimpleERC20V2 avec une config fixée
 *         pour identifier clairement le token WKEY officiel.
 */
contract WKEYToken is SimpleERC20V2 {
    constructor(address ecosystemAdmin, address registry_, string memory logoURI_)
        SimpleERC20V2(_buildConfig(ecosystemAdmin, registry_, logoURI_))
    {}

    function _buildConfig(address admin, address registry_, string memory logoURI_)
        private pure returns (Config memory)
    {
        return Config({
            name:                 "WKEY",
            symbol:               "WKEY",
            cap_:                 100_000_000 ether,
            initialSupply:        30_000_000 ether,
            admin:                admin,
            isSoulbound:          false,
            hasVotes:             true,
            isMintable:           true,
            logoURI:              logoURI_,
            verificationRegistry: registry_
        });
    }
}
