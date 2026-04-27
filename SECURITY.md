# Security Policy

We take the security of the WINTG protocol and its smart contracts
seriously. The chain runs in production and holds real value, so we
treat every credible report with priority.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, email the details to **security@wintg.group**. Include:

- A description of the vulnerability and its impact
- Steps to reproduce (PoC code if you have one)
- The affected component (contract name, file, network)
- Your preferred contact channel and PGP key if you use one

We aim to acknowledge your report within **24 hours on weekdays** and
provide a substantive response within 72 hours.

For very sensitive reports, ask for our PGP key in your first email
and we'll send it before you share details.

## Scope

In scope:

- Smart contracts under `contracts/src/**`
- Genesis configuration in `besu/genesis.json` and the generation
  script in `contracts/scripts/generate-genesis.ts`
- The validator bootstrap scripts in `scripts/`
- Faucet, SDK, and explorer code that ships from this repository
- The reverse-proxy / TLS configuration documented in `docs/DEPLOYMENT.md`

Out of scope:

- Third-party services (Hostinger, Cloudflare, etc.)
- Issues that require physical access to validator infrastructure
- Social engineering of WINTG team members
- Best-practice / informational findings without exploitable impact
  (e.g. "consider adding more comments")

## Disclosure timeline

Once we confirm a vulnerability:

| Day | Step |
|---|---|
| 0 | Triage and assign severity |
| 0–7 | Patch developed and reviewed internally |
| 7–14 | Patch deployed to testnet, validated |
| 14–30 | Coordinated rollout to mainnet |
| 30 | Public disclosure with attribution (if requested) |

We may extend the timeline for complex issues. We will keep you
updated and credit you in the disclosure unless you prefer to remain
anonymous.

## Severity guidelines

We use a CVSS-style framework adapted for blockchain:

- **Critical** — direct loss of user funds, validator key compromise,
  consensus halt, infinite mint
- **High** — privilege escalation, unauthorized state mutation, denial
  of service against the chain
- **Medium** — economic exploits with bounded impact, gas griefing,
  significant information disclosure
- **Low** — minor issues, edge cases without practical exploit paths
- **Informational** — coding standards, gas optimizations

## Bug bounty

A formal bounty program will launch alongside mainnet. The current
informal range is:

| Severity | Reward (USD-equivalent in WTG) |
|---|---|
| Critical | up to 50 000 |
| High | up to 15 000 |
| Medium | up to 5 000 |
| Low | up to 1 000 |
| Informational | swag / acknowledgement |

Rewards depend on impact, quality of the report, and whether a fix is
suggested. We reserve the right to adjust the reward at our discretion.

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to comply with this policy
- Avoid privacy violations, destruction of data, and service degradation
- Give us a reasonable time to respond before publicly disclosing
- Do not exploit issues beyond what is necessary to demonstrate them

If a third party initiates legal action, we will take steps to make
clear that your actions were authorized.

## PGP key

A PGP key for `security@wintg.group` is available on request. We will
publish the key fingerprint on `wintg.network` once mainnet is live.

---

Thanks for helping us keep WINTG safe.
