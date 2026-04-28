// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title  WintgChainMetadata
 * @author WINTG Team
 * @notice Registry souverain on-chain qui décrit la chaîne WINTG et son token
 *         natif WTG. Toute dApp / wallet / explorer peut lire ce registre en
 *         1 RPC pour récupérer les logos, noms, couleurs et URLs officielles
 *         sans dépendre d'un service tiers.
 *
 *         Ce contrat est complémentaire au ChainList JSON public
 *         (https://scan.wintg.network/chainlist.json) qui sert les wallets
 *         externes (MetaMask, Rabby, Trust Wallet) via leur convention
 *         d'auto-discovery.
 *
 *         Modèle de gouvernance :
 *           - `owner` (multisig WINTGTreasury) : peut tout modifier, peut
 *             nommer/révoquer le ChainAdmin, peut modifier les champs
 *             d'identité critique (chainName, chainSymbol, etc.)
 *           - `chainAdmin` : compte délégué qui peut modifier les champs
 *             "soft" (logos, descriptions, couleurs, URLs) sans nécessiter
 *             une signature multisig à chaque rebrand mineur.
 *
 *         Tous les changements émettent des events publics pour la
 *         traçabilité.
 *
 * @dev    Ce contrat est intentionnellement minimaliste : il ne fait QUE du
 *         stockage + lecture. Pas de logique métier, pas de paiement.
 *         Conforme aux règles WINTG : Apache-2.0, OZ v5, NatSpec, events
 *         structurés, Ownable2Step.
 */
contract WintgChainMetadata is Ownable2Step {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Longueur min/max d'une URI ou d'une string courte.
    uint256 public constant URI_MIN_LENGTH = 7;
    uint256 public constant URI_MAX_LENGTH = 256;
    uint256 public constant SHORT_TEXT_MAX = 64;
    uint256 public constant LONG_TEXT_MAX = 512;

    /// @notice Nombre maximum de bridges officiels listables.
    uint256 public constant MAX_BRIDGE_URLS = 10;

    // -------------------------------------------------------------------------
    // Storage — chain identity (critique, multisig only)
    // -------------------------------------------------------------------------

    /// @notice Nom complet de la chaîne (ex: "WINTG").
    string public chainName;

    /// @notice Symbole court (ex: "WINTG").
    string public chainSymbol;

    /// @notice Nom du token natif (ex: "WINTG").
    string public nativeTokenName;

    /// @notice Symbole du token natif (ex: "WTG").
    string public nativeTokenSymbol;

    // -------------------------------------------------------------------------
    // Storage — chain branding (modifiable par chainAdmin)
    // -------------------------------------------------------------------------

    /// @notice URI du logo de la chaîne (ipfs:// recommandé).
    string public chainLogoURI;

    /// @notice URI du logo du token natif WTG (ipfs:// recommandé).
    string public nativeTokenLogoURI;

    /// @notice URI d'une bannière promotionnelle (1500×500 recommandé).
    string public bannerURI;

    /// @notice Description courte de la chaîne.
    string public chainDescription;

    /// @notice Couleur primaire brand (hex, ex: "#FF6A1A").
    string public primaryColor;

    /// @notice Couleur secondaire brand (hex, ex: "#0A0B12").
    string public secondaryColor;

    /// @notice URL du site officiel (ex: "https://wintg.network").
    string public websiteURL;

    /// @notice URL de l'explorer officiel (ex: "https://scan.wintg.network").
    string public explorerURL;

    /// @notice URLs des bridges officiels (ex: ["https://bridge.wintg.network"]).
    string[] private _bridgeURLs;

    // -------------------------------------------------------------------------
    // Storage — admin
    // -------------------------------------------------------------------------

    /// @notice Compte délégué qui peut modifier les champs branding.
    address public chainAdmin;

    /// @notice Numéro de version, incrémenté à chaque update (off-chain cache busting).
    uint64 public version;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ChainAdminChanged(address indexed previousAdmin, address indexed newAdmin);

    event ChainIdentityUpdated(
        string chainName,
        string chainSymbol,
        string nativeTokenName,
        string nativeTokenSymbol,
        uint64 version
    );

    event ChainBrandingUpdated(uint64 version);

    event BridgeURLsUpdated(uint256 count, uint64 version);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidStringLength(uint256 length, uint256 minLen, uint256 maxLen);
    error NotChainAdmin();
    error TooManyBridgeURLs();
    error InvalidAdmin();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyChainAdmin() {
        if (msg.sender != chainAdmin && msg.sender != owner()) revert NotChainAdmin();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner Multisig WINTGTreasury (modifie l'identité critique).
     * @param initialChainAdmin Compte délégué pour les modifications branding (peut être identique à owner pour simplifier).
     * @param chainName_ Nom de la chaîne.
     * @param chainSymbol_ Symbole court.
     * @param nativeTokenName_ Nom du token natif.
     * @param nativeTokenSymbol_ Symbole du token natif.
     */
    constructor(
        address initialOwner,
        address initialChainAdmin,
        string memory chainName_,
        string memory chainSymbol_,
        string memory nativeTokenName_,
        string memory nativeTokenSymbol_
    ) Ownable(initialOwner) {
        if (initialChainAdmin == address(0)) revert InvalidAdmin();
        _validateShort(chainName_);
        _validateShort(chainSymbol_);
        _validateShort(nativeTokenName_);
        _validateShort(nativeTokenSymbol_);

        chainAdmin = initialChainAdmin;
        chainName = chainName_;
        chainSymbol = chainSymbol_;
        nativeTokenName = nativeTokenName_;
        nativeTokenSymbol = nativeTokenSymbol_;

        version = 1;

        emit ChainAdminChanged(address(0), initialChainAdmin);
        emit ChainIdentityUpdated(chainName_, chainSymbol_, nativeTokenName_, nativeTokenSymbol_, 1);
    }

    // -------------------------------------------------------------------------
    // Owner functions — chain identity (critical fields)
    // -------------------------------------------------------------------------

    /**
     * @notice Modifie l'identité critique de la chaîne. Réservé au multisig
     *         (rebrand profond, ce qui est censé être rare).
     */
    function setChainIdentity(
        string calldata chainName_,
        string calldata chainSymbol_,
        string calldata nativeTokenName_,
        string calldata nativeTokenSymbol_
    ) external onlyOwner {
        _validateShort(chainName_);
        _validateShort(chainSymbol_);
        _validateShort(nativeTokenName_);
        _validateShort(nativeTokenSymbol_);

        chainName = chainName_;
        chainSymbol = chainSymbol_;
        nativeTokenName = nativeTokenName_;
        nativeTokenSymbol = nativeTokenSymbol_;
        unchecked {
            version += 1;
        }
        emit ChainIdentityUpdated(chainName_, chainSymbol_, nativeTokenName_, nativeTokenSymbol_, version);
    }

    /// @notice Nomme le ChainAdmin. Réservé au multisig.
    function setChainAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert InvalidAdmin();
        address previous = chainAdmin;
        chainAdmin = newAdmin;
        emit ChainAdminChanged(previous, newAdmin);
    }

    // -------------------------------------------------------------------------
    // ChainAdmin functions — branding (soft fields)
    // -------------------------------------------------------------------------

    /**
     * @notice Modifie tous les champs branding en un seul appel (économe en
     *         gas pour un rebrand visuel complet).
     *
     * @dev    Toutes les chaînes peuvent être vides — chaîne vide signifie
     *         "non défini", géré côté front avec fallback.
     */
    function setBranding(
        string calldata chainLogoURI_,
        string calldata nativeTokenLogoURI_,
        string calldata bannerURI_,
        string calldata chainDescription_,
        string calldata primaryColor_,
        string calldata secondaryColor_,
        string calldata websiteURL_,
        string calldata explorerURL_
    ) external onlyChainAdmin {
        _validateOptionalURI(chainLogoURI_);
        _validateOptionalURI(nativeTokenLogoURI_);
        _validateOptionalURI(bannerURI_);
        _validateOptionalLong(chainDescription_);
        _validateOptionalShort(primaryColor_);
        _validateOptionalShort(secondaryColor_);
        _validateOptionalURI(websiteURL_);
        _validateOptionalURI(explorerURL_);

        chainLogoURI = chainLogoURI_;
        nativeTokenLogoURI = nativeTokenLogoURI_;
        bannerURI = bannerURI_;
        chainDescription = chainDescription_;
        primaryColor = primaryColor_;
        secondaryColor = secondaryColor_;
        websiteURL = websiteURL_;
        explorerURL = explorerURL_;
        unchecked {
            version += 1;
        }
        emit ChainBrandingUpdated(version);
    }

    /// @notice Modifie un seul champ logo (chemin rapide).
    function setChainLogoURI(string calldata uri) external onlyChainAdmin {
        _validateOptionalURI(uri);
        chainLogoURI = uri;
        unchecked {
            version += 1;
        }
        emit ChainBrandingUpdated(version);
    }

    /// @notice Modifie le logo du token natif.
    function setNativeTokenLogoURI(string calldata uri) external onlyChainAdmin {
        _validateOptionalURI(uri);
        nativeTokenLogoURI = uri;
        unchecked {
            version += 1;
        }
        emit ChainBrandingUpdated(version);
    }

    /// @notice Remplace la liste complète des bridges officiels.
    function setBridgeURLs(string[] calldata urls) external onlyChainAdmin {
        if (urls.length > MAX_BRIDGE_URLS) revert TooManyBridgeURLs();
        delete _bridgeURLs;
        for (uint256 i; i < urls.length; ++i) {
            _validateOptionalURI(urls[i]);
            _bridgeURLs.push(urls[i]);
        }
        unchecked {
            version += 1;
        }
        emit BridgeURLsUpdated(urls.length, version);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Retourne la liste des bridges officiels.
    function bridgeURLs() external view returns (string[] memory) {
        return _bridgeURLs;
    }

    /// @notice Renvoie la longueur de la liste de bridges (utile pour pagination).
    function bridgeURLsCount() external view returns (uint256) {
        return _bridgeURLs.length;
    }

    /**
     * @notice Snapshot complet du metadata. Pratique pour les wallets qui
     *         veulent tout récupérer en 1 lecture (multicall optionnel).
     */
    function snapshot()
        external
        view
        returns (
            string memory chainName_,
            string memory chainSymbol_,
            string memory nativeTokenName_,
            string memory nativeTokenSymbol_,
            string memory chainLogoURI_,
            string memory nativeTokenLogoURI_,
            string memory bannerURI_,
            string memory chainDescription_,
            string memory websiteURL_,
            string memory explorerURL_,
            uint64 version_
        )
    {
        return (
            chainName,
            chainSymbol,
            nativeTokenName,
            nativeTokenSymbol,
            chainLogoURI,
            nativeTokenLogoURI,
            bannerURI,
            chainDescription,
            websiteURL,
            explorerURL,
            version
        );
    }

    // -------------------------------------------------------------------------
    // Internal validation
    // -------------------------------------------------------------------------

    function _validateShort(string memory s) internal pure {
        uint256 len = bytes(s).length;
        if (len == 0 || len > SHORT_TEXT_MAX) revert InvalidStringLength(len, 1, SHORT_TEXT_MAX);
    }

    function _validateOptionalShort(string memory s) internal pure {
        uint256 len = bytes(s).length;
        if (len > SHORT_TEXT_MAX) revert InvalidStringLength(len, 0, SHORT_TEXT_MAX);
    }

    function _validateOptionalLong(string memory s) internal pure {
        uint256 len = bytes(s).length;
        if (len > LONG_TEXT_MAX) revert InvalidStringLength(len, 0, LONG_TEXT_MAX);
    }

    function _validateOptionalURI(string memory s) internal pure {
        uint256 len = bytes(s).length;
        if (len == 0) return; // empty URIs are allowed (means "not set")
        if (len < URI_MIN_LENGTH || len > URI_MAX_LENGTH) {
            revert InvalidStringLength(len, URI_MIN_LENGTH, URI_MAX_LENGTH);
        }
    }
}
