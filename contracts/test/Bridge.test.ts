import { expect } from "chai";
import { ethers } from "hardhat";

const ONE = 10n ** 18n;

async function buildUnlockSig(
  bridge: any,
  signer: any,
  recipient: string,
  amount: bigint,
  sourceChainId: number,
  sourceTxHash: string,
  nonce: bigint,
) {
  const domain = {
    name: "WINTGBridge",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await bridge.getAddress(),
  };
  const types = {
    Unlock: [
      { name: "recipient",      type: "address" },
      { name: "amount",         type: "uint256" },
      { name: "sourceChainId",  type: "uint64" },
      { name: "sourceTxHash",   type: "bytes32" },
      { name: "nonce",          type: "uint256" },
    ],
  };
  const value = { recipient, amount, sourceChainId, sourceTxHash, nonce };
  return signer.signTypedData(domain, types, value);
}

describe("WINTGBridge", () => {
  it("lock + Locked event", async () => {
    const [owner, r1, r2, r3, alice] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("WINTGBridge");
    const bridge = await Bridge.deploy(owner.address, [r1.address, r2.address, r3.address], 2);

    await expect(bridge.connect(alice).lock(56, alice.address, { value: 10n * ONE }))
      .to.emit(bridge, "Locked");
    expect(await bridge.totalLocked()).to.equal(10n * ONE);
  });

  it("unlock avec 2-of-3 signatures valide", async () => {
    const [owner, r1, r2, r3, alice, bob] = await ethers.getSigners();
    // Trier les relayers par ordre croissant d'adresse (requis par le bridge)
    const sortedRelayers = [r1, r2, r3].sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));
    const Bridge = await ethers.getContractFactory("WINTGBridge");
    const bridge = await Bridge.deploy(owner.address, sortedRelayers.map((s) => s.address), 2);

    // Fund le bridge (= simule le locked depuis l'autre direction)
    await alice.sendTransaction({ to: await bridge.getAddress(), value: 100n * ONE });
    // Lock 100 WTG pour avoir totalLocked > 0 (rate limit a besoin de totalLocked)
    await bridge.connect(alice).lock(56, alice.address, { value: 100n * ONE });

    const recipient = bob.address;
    const amount = 1n * ONE;
    const sourceChainId = 1;
    const sourceTxHash = "0x" + "ab".repeat(32);
    const nonce = 42n;

    // 2 signatures parmi 3 (en ordre croissant)
    const sigs: string[] = [];
    sigs.push(await buildUnlockSig(bridge, sortedRelayers[0], recipient, amount, sourceChainId, sourceTxHash, nonce));
    sigs.push(await buildUnlockSig(bridge, sortedRelayers[1], recipient, amount, sourceChainId, sourceTxHash, nonce));

    const before = await ethers.provider.getBalance(recipient);
    await bridge.unlock(recipient, amount, sourceChainId, sourceTxHash, nonce, sigs);
    const after = await ethers.provider.getBalance(recipient);
    expect(after - before).to.equal(amount);
    expect(await bridge.usedNonces(nonce)).to.be.true;
  });

  it("rejette nonce déjà utilisé", async () => {
    const [owner, r1, r2, alice, bob] = await ethers.getSigners();
    const sorted = [r1, r2].sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));
    const Bridge = await ethers.getContractFactory("WINTGBridge");
    const bridge = await Bridge.deploy(owner.address, sorted.map((s) => s.address), 2);
    await alice.sendTransaction({ to: await bridge.getAddress(), value: 100n * ONE });
    await bridge.connect(alice).lock(56, alice.address, { value: 100n * ONE });

    const args = [bob.address, ONE, 1, "0x" + "00".repeat(32), 1n] as const;
    const sigs = [
      await buildUnlockSig(bridge, sorted[0], ...args),
      await buildUnlockSig(bridge, sorted[1], ...args),
    ];
    await bridge.unlock(...args, sigs);
    await expect(bridge.unlock(...args, sigs)).to.be.revertedWithCustomError(bridge, "NonceAlreadyUsed");
  });

  it("rejette signatures insuffisantes", async () => {
    const [owner, r1, r2, alice, bob] = await ethers.getSigners();
    const sorted = [r1, r2].sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));
    const Bridge = await ethers.getContractFactory("WINTGBridge");
    const bridge = await Bridge.deploy(owner.address, sorted.map((s) => s.address), 2);
    await alice.sendTransaction({ to: await bridge.getAddress(), value: 100n * ONE });
    await bridge.connect(alice).lock(56, alice.address, { value: 100n * ONE });

    const args = [bob.address, ONE, 1, "0x" + "00".repeat(32), 7n] as const;
    const sigs = [await buildUnlockSig(bridge, sorted[0], ...args)]; // 1/2

    await expect(bridge.unlock(...args, sigs)).to.be.revertedWithCustomError(
      bridge,
      "InsufficientSignatures",
    );
  });
});
