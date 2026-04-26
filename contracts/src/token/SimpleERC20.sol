// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  SimpleERC20
 * @author WINTG Team
 * @notice Template d'ERC-20 standard déployé via `TokenFactory`. Permet à
 *         n'importe qui de lancer son propre token sur WINTG sans écrire de
 *         code Solidity.
 *
 *         Inclut :
 *         - ERC-20 standard (transfer, approve, allowance)
 *         - EIP-2612 permit (signatures gasless approvals)
 *         - Burnable (burn, burnFrom)
 *         - Ownable (mintable par owner si `mintable=true`)
 *
 *         Si `mintable=false` à la création, le supply est fixe et l'owner
 *         ne peut plus mint après le déploiement initial.
 */
contract SimpleERC20 is ERC20, ERC20Permit, ERC20Burnable, Ownable {
    /// @notice `true` si le token peut continuer à être minté par l'owner.
    bool public immutable mintable;

    /// @notice Décimales du token (standard 18, configurable de 0 à 18).
    uint8 private immutable _customDecimals;

    error MintingDisabled();
    error InvalidDecimals();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address initialHolder,
        bool mintable_
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
        Ownable(initialHolder)
    {
        if (decimals_ > 18) revert InvalidDecimals();
        _customDecimals = decimals_;
        mintable = mintable_;
        if (initialSupply > 0) {
            _mint(initialHolder, initialSupply);
        }
    }

    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }

    /// @notice Mint additionnel — réservé à l'owner et seulement si `mintable=true`.
    function mint(address to, uint256 amount) external onlyOwner {
        if (!mintable) revert MintingDisabled();
        _mint(to, amount);
    }
}
