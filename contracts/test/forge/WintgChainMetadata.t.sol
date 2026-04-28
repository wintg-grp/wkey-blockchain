// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {WintgChainMetadata} from "../../src/metadata/WintgChainMetadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract WintgChainMetadataTest is Test {
    WintgChainMetadata internal meta;

    address internal owner = address(0xA1);
    address internal admin = address(0xB2);
    address internal stranger = address(0xC3);

    function setUp() public {
        meta = new WintgChainMetadata(owner, admin, "WINTG", "WINTG", "WINTG", "WTG");
    }

    /* --------------------------- Identity --------------------------- */

    function test_constructor_setsIdentity() public view {
        assertEq(meta.chainName(), "WINTG");
        assertEq(meta.chainSymbol(), "WINTG");
        assertEq(meta.nativeTokenName(), "WINTG");
        assertEq(meta.nativeTokenSymbol(), "WTG");
        assertEq(meta.chainAdmin(), admin);
        assertEq(meta.owner(), owner);
        assertEq(meta.version(), 1);
    }

    function test_setChainIdentity_byOwner_succeeds() public {
        vm.prank(owner);
        meta.setChainIdentity("WINTG2", "W2", "WINTG2", "WTG2");
        assertEq(meta.chainName(), "WINTG2");
        assertEq(meta.version(), 2);
    }

    function test_setChainIdentity_byAdmin_reverts() public {
        vm.prank(admin);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        meta.setChainIdentity("X", "X", "X", "X");
    }

    function test_setChainIdentity_emptyName_reverts() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(WintgChainMetadata.InvalidStringLength.selector, uint256(0), uint256(1), uint256(64))
        );
        meta.setChainIdentity("", "X", "X", "X");
    }

    /* ----------------------- Branding (admin) ------------------------ */

    function test_setBranding_byAdmin_succeeds() public {
        vm.prank(admin);
        meta.setBranding(
            "ipfs://QmChain",
            "ipfs://QmWtg",
            "ipfs://QmBanner",
            "An African L1 chain",
            "#FF6A1A",
            "#0A0B12",
            "https://wintg.network",
            "https://scan.wintg.network"
        );
        assertEq(meta.chainLogoURI(), "ipfs://QmChain");
        assertEq(meta.nativeTokenLogoURI(), "ipfs://QmWtg");
        assertEq(meta.version(), 2);
    }

    function test_setBranding_byOwner_succeeds() public {
        // owner has admin powers too
        vm.prank(owner);
        meta.setBranding("ipfs://x", "", "", "", "", "", "", "");
        assertEq(meta.chainLogoURI(), "ipfs://x");
    }

    function test_setBranding_byStranger_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(WintgChainMetadata.NotChainAdmin.selector);
        meta.setBranding("ipfs://x", "", "", "", "", "", "", "");
    }

    function test_setBranding_uriTooShort_reverts() public {
        vm.prank(admin);
        vm.expectRevert();
        meta.setBranding("abc", "", "", "", "", "", "", "");
    }

    function test_setChainLogoURI_emptyAllowed() public {
        vm.prank(admin);
        meta.setChainLogoURI("");
        assertEq(meta.chainLogoURI(), "");
    }

    function test_setChainLogoURI_versionIncrements() public {
        uint64 v0 = meta.version();
        vm.prank(admin);
        meta.setChainLogoURI("ipfs://Qm123456");
        assertEq(meta.version(), v0 + 1);
    }

    /* --------------------------- Bridges ----------------------------- */

    function test_setBridgeURLs_succeeds() public {
        string[] memory urls = new string[](2);
        urls[0] = "https://bridge.wintg.network";
        urls[1] = "https://bridge2.wintg.network";

        vm.prank(admin);
        meta.setBridgeURLs(urls);

        string[] memory got = meta.bridgeURLs();
        assertEq(got.length, 2);
        assertEq(got[0], urls[0]);
        assertEq(got[1], urls[1]);
        assertEq(meta.bridgeURLsCount(), 2);
    }

    function test_setBridgeURLs_overwrites() public {
        string[] memory first = new string[](2);
        first[0] = "https://a.example.com";
        first[1] = "https://b.example.com";
        vm.prank(admin);
        meta.setBridgeURLs(first);

        string[] memory second = new string[](1);
        second[0] = "https://c.example.com";
        vm.prank(admin);
        meta.setBridgeURLs(second);

        assertEq(meta.bridgeURLsCount(), 1);
        assertEq(meta.bridgeURLs()[0], "https://c.example.com");
    }

    function test_setBridgeURLs_tooMany_reverts() public {
        string[] memory urls = new string[](11);
        for (uint256 i; i < 11; ++i) urls[i] = "https://example.com";
        vm.prank(admin);
        vm.expectRevert(WintgChainMetadata.TooManyBridgeURLs.selector);
        meta.setBridgeURLs(urls);
    }

    /* --------------------------- Admin ------------------------------- */

    function test_setChainAdmin_byOwner_succeeds() public {
        vm.prank(owner);
        meta.setChainAdmin(stranger);
        assertEq(meta.chainAdmin(), stranger);
    }

    function test_setChainAdmin_zeroAddress_reverts() public {
        vm.prank(owner);
        vm.expectRevert(WintgChainMetadata.InvalidAdmin.selector);
        meta.setChainAdmin(address(0));
    }

    function test_setChainAdmin_byNonOwner_reverts() public {
        vm.prank(admin);
        vm.expectRevert();
        meta.setChainAdmin(stranger);
    }

    /* --------------------------- Snapshot ---------------------------- */

    function test_snapshot_returnsAllFields() public {
        vm.prank(admin);
        meta.setBranding("ipfs://Qm111", "ipfs://Qm222", "", "WINTG L1", "", "", "", "");

        (
            string memory cn,
            string memory cs,
            string memory ntn,
            string memory nts,
            string memory cl,
            string memory ntl,
            ,
            string memory cd,
            ,
            ,
            uint64 v
        ) = meta.snapshot();

        assertEq(cn, "WINTG");
        assertEq(cs, "WINTG");
        assertEq(ntn, "WINTG");
        assertEq(nts, "WTG");
        assertEq(cl, "ipfs://Qm111");
        assertEq(ntl, "ipfs://Qm222");
        assertEq(cd, "WINTG L1");
        assertEq(v, 2);
    }

    /* --------------------------- Fuzz -------------------------------- */

    function testFuzz_setChainLogoURI_validLength(string calldata uri) public {
        uint256 len = bytes(uri).length;
        vm.assume(len == 0 || (len >= 7 && len <= 256));
        vm.prank(admin);
        meta.setChainLogoURI(uri);
        assertEq(meta.chainLogoURI(), uri);
    }
}
