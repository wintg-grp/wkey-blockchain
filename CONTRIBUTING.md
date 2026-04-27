# Contributing to WINTG

Thanks for considering a contribution. WINTG is open source and we
welcome PRs from the community — whether it's a typo fix, a new
feature in the SDK, or a deeper change to the contracts.

## Before you start

- For anything beyond a small fix, **open an issue first** so we can
  discuss the approach. This avoids wasted work if your idea conflicts
  with something already in flight.
- Check open issues for `good-first-issue` and `help-wanted` tags if
  you're new.
- Read [`SECURITY.md`](SECURITY.md) before submitting anything that
  could touch consensus, key management, or token economics.

## Development setup

You'll need:

- Node.js 20 or later
- Git
- (Optional) Docker for the local Besu chain

```bash
git clone https://github.com/wintg-grp/wkey-blockchain.git
cd wkey-blockchain
npm install --workspaces
```

The repository is a monorepo with three workspaces: `contracts`,
`sdk`, `faucet`. Run scripts from the workspace root with
`npm --workspace <name> run <script>`.

## Branches and commits

- Branch from `main`. Keep branches focused on a single change.
- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`.
- One logical change per commit. Squash noise before opening the PR.

Example:
```
feat(validators): allow open candidacy with WTG bond
fix(treasury): prevent double-execution of timelocked tx
docs(gaming): add ERC-1155 royalty example
```

## Required checks before opening a PR

For changes that touch contracts:

```bash
cd contracts
npm run lint
npm test
npm run coverage
```

Coverage must remain ≥ 95 % branches. The CI will fail otherwise.

For changes that touch the SDK or faucet:

```bash
cd sdk    # or faucet
npm run lint
npm test
npm run build
```

For documentation only — no checks beyond a visual review.

## What we look for in a PR

- **A clear description** in the PR body. State the problem and the
  approach. Link the issue if there is one.
- **Tests for new behavior.** If you added a function, there should be
  a test that exercises both happy path and at least one error path.
- **No commented-out code.** Delete it.
- **No unrelated reformatting.** Keep the diff minimal.
- **No new dependencies without discussion.** Especially for the
  contracts package, where every dep is part of the audit surface.

## Smart contract conventions

- Solidity 0.8.24
- Use OpenZeppelin v5 primitives (`Ownable2Step`, `ReentrancyGuard`,
  `Pausable`, `AccessControl` if needed)
- NatSpec on every public/external function
- Custom errors instead of `require(..., "string")`
- Events for every state-changing action
- Optimizer on, runs = 200, viaIR = true

## TypeScript conventions

- Strict mode on
- Explicit return types on exported functions
- ESLint clean
- No `any` without a comment explaining why

## What gets rejected

Things that will block a merge:

- Tests fail or coverage drops below 95 %
- Lint errors or formatting drift
- Breaking changes without a migration plan
- New external calls in audited contracts without a security review
- "Fixes" that aren't traceable to an issue or to a documented bug

## Getting your PR reviewed

- Tag a maintainer if it's been more than 5 days without a review
- Be patient and responsive to feedback — we read every PR
- If we ask for changes, push them as new commits (don't force-push)
  until the PR is approved; then squash if requested

## Release process

We release tags as `v<MAJOR>.<MINOR>.<PATCH>` from `main`. CHANGELOG
entries are added in the same PR as the change. Maintainers cut
releases roughly every 4 weeks or as needed for security fixes.

## Code of Conduct

By contributing, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md). Be excellent to each other.

## License

Contributions are accepted under the [Apache License 2.0](LICENSE).
By submitting a PR you affirm that you have the right to license your
contribution under those terms.

---

Questions? Open a discussion or email `contact@wintg.group`.
