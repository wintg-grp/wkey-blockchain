# Validator Guide

This guide explains how to run a validator on WINTG: what you need,
how to apply, what the bond means, and how the partnership works
once you're in the consensus set.

WINTG runs IBFT 2.0 with an open candidacy on top. We don't pick
validators in private. Anyone with the right setup can apply.

## Why become a validator

Validators are the people who actually run the chain. They produce
blocks, finalise transactions, host RPC for the rest of the network,
and keep the system honest. In return, validators receive 50 % of
the fees collected on every block they produce, paid in WTG.

If you operate infrastructure already (DevOps, sysadmin, hosting
business, university lab, payments operator), running a validator
is a natural extension. We expect to grow the validator set over
time as adoption increases.

## Requirements

### Hardware (minimum)

- 8 vCPU (modern x86-64 or ARM64)
- 16 GB RAM
- 200 GB NVMe SSD (we recommend 500 GB to leave headroom)
- 100 Mbit/s symmetric network with a stable public IPv4
- 99.9 % monthly uptime target

### Software

- Ubuntu 22.04 LTS or AlmaLinux 9 (other distros work but aren't
  formally supported)
- Hyperledger Besu 26.4.0 or later
- A working firewall (ufw, csf, firewalld — any of them)
- An NTP service (chronyd or systemd-timesyncd) — clock drift
  causes consensus issues

### Operational

- 24/7 on-call rotation (or willingness to be the on-call yourself)
- A way for us to reach you in less than an hour for incidents
- Encrypted backups of your validator key (the only thing you can't
  reissue)

## How the bond works

When you apply, you post a bond denominated in **USD**. At launch the
bond is **10 USD** worth of WTG. The contract reads a live WTG/USD
price feed at the moment you apply and computes how much WTG that
represents. You send that WTG along with your `applyAsValidator`
call.

Three things to know about the bond:

1. **It stays locked** in the `ValidatorRegistry` contract while you
   operate. You don't earn yield on it; it's collateral.
2. **It's refunded in full when you exit cleanly.** When the team
   removes you on your request (you want to stop, you want to
   re-key, you want to migrate hardware), you get the remaining bond
   back to the validator address.
3. **It can be partially slashed for misbehavior.** Provable
   misbehavior — equivocation, signing two blocks at the same height,
   sustained censorship — triggers a partial slash. The slashed
   amount is sent to the Treasury; the rest stays withdrawable on
   exit. We don't have whole-bond slashing. We don't surprise
   validators with slashing.

The DAO can change the bond amount via a vote. Existing bonds are
not retroactively re-priced; only new applications use the new
threshold.

## How the application flow works

### 1. Bring up the node

Sync to the head of the chain. You can do this in about a day on
mainnet; faster on testnet.

```bash
git clone https://github.com/wintg-grp/wkey-blockchain.git
cd wkey-blockchain
sudo ./scripts/setup-validator.sh mainnet
```

Wait until `eth_blockNumber` returns the same height as
`https://rpc.wintg.network`. While you wait, generate the
validator address from the node key:

```bash
sudo -u besu besu --data-path=/var/lib/besu/data \
  public-key export-address | tail -1
```

Save this address. It's what you'll register on-chain.

### 2. Capture the enode URL

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"net_enode","params":[],"id":1}' \
  http://127.0.0.1:8545 | jq -r .result
```

That string starts with `enode://...`. Save it.

### 3. Apply on-chain

Send the application transaction to the `ValidatorRegistry` contract.
The bond amount must be at least the value returned by
`bondInWtgWei()` at the moment you submit.

Quick example with ethers:

```ts
const reg = new ethers.Contract(REGISTRY_ADDR, registryAbi, wallet);
const required = await reg.bondInWtgWei();

await reg.applyAsValidator(
  validatorAddress,                            // the address you exported above
  "Acme Datacenter",                           // public-facing name
  "Acme Inc.",                                 // operator entity
  "https://acme.example",                      // operator website
  "EF24 PGP fingerprint here",                 // optional
  "Lomé, Togo",                                // operator location
  "enode://abc...@1.2.3.4:30303",              // your enode
  { value: required }
);
```

Your candidacy now shows up in `listCandidates()` with `status =
Pending`.

### 4. Coordinate with the existing validators

Reach out to us on the channels listed below. We need to:

- Verify you control the validator address (sign a challenge)
- Verify your enode is reachable
- Confirm operator details
- Run a couple of soft tests on your node

Once we're satisfied, we approve the candidacy on-chain. After that,
existing validators run `ibft_proposeValidatorVote(true, <addr>)` on
their own nodes. Once a quorum has voted, the consensus set updates
at the next epoch and your node starts producing blocks.

If we don't approve — for whatever reason — your bond is refunded
in full and the candidacy is closed.

## Communication channels

We coordinate operationally on:

- **Email** — `validators@wintg.group` (general),
  `security@wintg.group` (incidents). Email is always open.
- **Telegram** — operator channel. The invite link will be published
  on `https://wintg.network` and shared directly with you when your
  candidacy is approved. Setup is in progress.
- **Discord** — same logic as Telegram. Setup is in progress.
- **Keybase** — username `wintg`. We use this for sensitive ops
  (signed messages, encrypted file exchange).

If something is on fire, email and direct messaging take priority
over public channels.

## After you're in the consensus set

You're expected to:

- Run the latest stable Besu release within 30 days of release
- Apply security patches within 7 days of disclosure
- Maintain the uptime target above
- Acknowledge incident reports within an hour
- Give 30 days' notice if you want to exit

You are **not** expected to:

- Speak publicly on behalf of WINTG (that's our job)
- Coordinate validator votes outside the agreed governance process
- Run validator software other than the supported Besu version

## Exiting

To leave cleanly:

1. Email `validators@wintg.group` with 30 days' notice
2. We coordinate the timing so the consensus set never drops below
   the safe threshold
3. We call `remove(yourValidator)` on the registry — your remaining
   bond is refunded to the validator address in the same transaction
4. We run `ibft_proposeValidatorVote(false, <addr>)` on the existing
   nodes — your node is removed from consensus at the next epoch
5. You shut your node down

## Slashing in practice

We've designed the slashing to be predictable, not punitive. The
intent is to make malicious or grossly negligent operation costly,
not to penalise honest mistakes.

What gets slashed:

- Signing two competing blocks at the same height (equivocation)
- Sustained, deliberate censorship of valid transactions
- Long-running consensus stalls clearly attributable to a single
  validator

What does not get slashed:

- A reboot
- A short outage
- A configuration mistake that doesn't impact consensus
- Anything caught and fixed within an hour

The percentage is decided case by case based on impact. The cap is
100 %; we have never run anything close to that.

## Rewards

Block fees are routed through the `FeeDistributor` contract on every
distribution call:

- 40 % Treasury
- **50 % validator pool** — distributed pro-rata to active validators
- 5 % burn (deflationary)
- 5 % community pool (campaigns, airdrops, ecosystem grants)

A keeper sweeps the validator coinbase into the distributor at a
regular cadence; you can also sweep your own coinbase manually. The
exact distribution math and contract addresses are in
[`FEES.md`](FEES.md).

## Questions

The fastest way to get an answer is `validators@wintg.group`. If
you're not yet in the operator channels, that's the right starting
point. We read every message.
