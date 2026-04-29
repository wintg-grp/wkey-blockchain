// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title  MockMintBurnToken
 * @notice ERC-20 minimaliste avec mint() + burnFrom() pour les tests des
 *         vaults (USDW / WCFA). Pas pour la prod.
 */
contract MockMintBurnToken is ERC20 {
    address public owner;
    mapping(address => bool) public minters;

    error NotMinter();
    error NotOwner();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        owner = msg.sender;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner) revert NotMinter();
        _;
    }

    function setMinter(address m, bool ok) external {
        if (msg.sender != owner) revert NotOwner();
        minters[m] = ok;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyMinter {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}
