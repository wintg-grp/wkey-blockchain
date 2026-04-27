# Security Policy

We take security seriously. WINTG runs in production and holds real
value, so every credible report is treated as a priority.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, email the details to **security@wintg.group**. Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (PoC code if you have one)
- The affected component (contract name, file, network)
- Your preferred contact channel and PGP key if you use one

We acknowledge reports within **24 hours on weekdays** and aim for a
substantive response within 72 hours.

For very sensitive reports, ask us for the team PGP key in your first
email and we'll send it back before you share the details. You can
also reach us on Keybase under **`wintg`**.

## Scope

In scope:

- Smart contracts under `contracts/src/**`
- Genesis configuration in `besu/genesis.json` and the generation
  script in `contracts/scripts/generate-genesis.ts`
- The validator bootstrap scripts in `scripts/`
- Faucet, SDK, and explorer code that ships from this repository
- The reverse-proxy / TLS configuration documented in
  `docs/DEPLOYMENT.md`

Out of scope:

- Third-party services (hosting providers, DNS, etc.)
- Issues that require physical access to validator infrastructure
- Social engineering of team members
- Best-practice or informational findings without exploitable impact
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

The timeline can extend for complex issues. We keep you updated and
credit you in the disclosure unless you prefer to remain anonymous.

## Severity guidelines

We use a CVSS-style framework adapted for blockchain:

- **Critical** — direct loss of user funds, validator key compromise,
  consensus halt, infinite mint
- **High** — privilege escalation, unauthorized state mutation,
  denial of service against the chain
- **Medium** — economic exploits with bounded impact, gas griefing,
  significant information disclosure
- **Low** — minor issues or edge cases without a practical exploit
- **Informational** — coding standards, gas optimisations

## Rewards

We don't run a formal bug bounty programme yet. Once we do, we'll
publish the rules here and on the website. In the meantime we'll
acknowledge contributors publicly (with permission) and may offer
ad-hoc rewards depending on impact.

## Safe harbor

We will not pursue legal action against researchers who:

- Act in good faith and comply with this policy
- Avoid privacy violations, destruction of data, and service
  degradation
- Give us a reasonable time to respond before publicly disclosing
- Do not exploit issues beyond what is necessary to demonstrate them

If a third party initiates legal action, we will take steps to make
clear that your actions were authorised.

## PGP

A PGP key for `security@wintg.group` is available on request. We
publish the fingerprint on `https://wintg.network` once it's
generated.

---

Thanks for helping us keep WINTG safe.
