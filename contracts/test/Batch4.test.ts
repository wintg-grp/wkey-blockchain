/**
 * Batch 4 — Identity & Domains smoke test.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("Batch 4 — Identity & Domains", () => {
  let owner: Signer, treasury: Signer, alice: Signer, bob: Signer, carol: Signer;

  beforeEach(async () => {
    [owner, treasury, alice, bob, carol] = await ethers.getSigners();
  });

  /* --------------------------- Domain Registry V2 --------------------------- */

  it("Domain V2: register + reverse + subdomain + grace period", async () => {
    const Domain = await ethers.getContractFactory("WtgDomainRegistryV2");
    const domain = await Domain.deploy(await owner.getAddress(), await treasury.getAddress());

    // Register alice.wtg
    await domain.connect(alice).register("alice", await alice.getAddress(), { value: ethers.parseEther("250") });
    expect(await domain.resolve("alice")).to.equal(await alice.getAddress());

    // Reverse resolution auto-set
    expect(await domain.primaryName(await alice.getAddress())).to.equal(await domain.nameHash("alice"));

    // Register shop.wtg + create alice.shop subdomain
    await domain.connect(bob).register("shop", await bob.getAddress(), { value: ethers.parseEther("250") });
    await domain.connect(bob).createSubdomain("shop", "alice", await alice.getAddress());
    expect(await domain.resolve("alice.shop")).to.equal(await alice.getAddress());

    // Subdomain creation by non-parent owner reverts.
    await expect(domain.connect(carol).createSubdomain("shop", "carol", await carol.getAddress())).to.be.reverted;

    // Bob revokes alice.shop
    await domain.connect(bob).revokeSubdomain("shop", "alice");
    expect(await domain.resolve("alice.shop")).to.equal(ethers.ZeroAddress);
  });

  it("Domain V2: insufficient fee reverts", async () => {
    const Domain = await ethers.getContractFactory("WtgDomainRegistryV2");
    const domain = await Domain.deploy(await owner.getAddress(), await treasury.getAddress());
    await expect(domain.connect(alice).register("test", await alice.getAddress(), { value: ethers.parseEther("100") })).to.be.reverted;
  });

  /* --------------------------- Profile Registry --------------------------- */

  it("Profile: setProfile + extra + flag/unflag", async () => {
    const PR = await ethers.getContractFactory("ProfileRegistry");
    const pr = await PR.deploy(await owner.getAddress());

    await pr.connect(alice).setProfile("ipfs://av", "Africa builder", "alice@x.com", "@alice", "alice", "@alice_t", "https://alice.io");
    const p = await pr.profileOf(await alice.getAddress());
    expect(p.bio).to.equal("Africa builder");
    expect(p.twitter).to.equal("@alice");

    await pr.connect(alice).setExtra("country", "TG");
    expect(await pr.extraOf(await alice.getAddress(), "country")).to.equal("TG");

    // Flag by moderator
    await pr.connect(owner).flag(await alice.getAddress(), "ipfs://QmReport");
    expect(await pr.flagged(await alice.getAddress())).to.equal("ipfs://QmReport");
    await expect(pr.connect(alice).flag(await alice.getAddress(), "ipfs://QmReport")).to.be.reverted;
  });

  /* --------------------------- VC Registry --------------------------- */

  it("VC: apply + approve + issue + revoke", async () => {
    const VC = await ethers.getContractFactory("VerifiableCredentialsRegistry");
    const vc = await VC.deploy(await owner.getAddress(), await treasury.getAddress());

    // Bob applies as Issuer with 5000 WTG bond.
    await vc.connect(bob).applyAsIssuer("Univ-Lome", "ipfs://QmIssuerLome", { value: ethers.parseEther("5000") });
    expect(await vc.isIssuer(await bob.getAddress())).to.equal(false);

    // Owner approves Bob.
    await vc.connect(owner).approveIssuer(await bob.getAddress());
    expect(await vc.isIssuer(await bob.getAddress())).to.equal(true);

    // Bob issues a VC for Alice.
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("Alice-Diploma-2026"));
    const tx = await vc.connect(bob).issueCredential(await alice.getAddress(), credentialHash, "ipfs://QmCredAlice", 0);
    const r = await tx.wait();
    const ev = r!.logs.find((l: any) => l.fragment?.name === "CredentialIssued") as any;
    const credId = ev.args[0];

    expect(await vc.isCredentialValid(credId)).to.equal(true);
    expect((await vc.credentialsOfHolder(await alice.getAddress())).length).to.equal(1);

    // Bob revokes.
    await vc.connect(bob).revokeCredential(credId, "Diploma was forged");
    expect(await vc.isCredentialValid(credId)).to.equal(false);
  });

  it("VC: wrong bond reverts", async () => {
    const VC = await ethers.getContractFactory("VerifiableCredentialsRegistry");
    const vc = await VC.deploy(await owner.getAddress(), await treasury.getAddress());
    await expect(vc.connect(bob).applyAsIssuer("Foo", "ipfs://QmFoo", { value: ethers.parseEther("100") })).to.be.reverted;
  });

  /* --------------------------- Social Recovery --------------------------- */

  it("Recovery: setup + (skipped) full E2E (requires recoverable wallet contract)", async () => {
    const SR = await ethers.getContractFactory("SocialRecoveryModule");
    const sr = await SR.deploy();

    const guardians = [await bob.getAddress(), await carol.getAddress(), await owner.getAddress()];
    await sr.connect(alice).setupRecovery(guardians, 2);

    const [guards, threshold, configured] = await sr.configOf(await alice.getAddress());
    expect(guards.length).to.equal(3);
    expect(threshold).to.equal(2n);
    expect(configured).to.equal(true);
  });

  it("Recovery: invalid threshold reverts", async () => {
    const SR = await ethers.getContractFactory("SocialRecoveryModule");
    const sr = await SR.deploy();

    // Threshold > guardians count
    await expect(
      sr.connect(alice).setupRecovery([await bob.getAddress(), await carol.getAddress()], 5)
    ).to.be.reverted;

    // Less than 2 guardians
    await expect(sr.connect(alice).setupRecovery([await bob.getAddress()], 1)).to.be.reverted;
  });
});
