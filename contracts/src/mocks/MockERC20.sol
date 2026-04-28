// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title  MockERC20
 * @author WINTG Team
 * @notice Token ERC-20 minimaliste pour les tests. Mint 1B au déployeur.
 */
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
}
