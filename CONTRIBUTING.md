# Contributing to ensforge

Thanks for helping improve ensforge. Contributions to actions, contracts, integrations, tests, and
documentation are welcome.

## Prerequisites

- Node.js 24.18.0 or newer in the Node.js 24 release line
- pnpm 11.10.0
- Docker for contract integration tests

The repository pins its Node.js version in `.node-version` and its package manager in
`package.json`.

## Setup

Fork and clone the repository, then install dependencies and build the workspace:

```sh
pnpm install
pnpm build
```

Run `pnpm dev` while changing multiple packages so dependent packages continuously receive current
declaration files.

## Repository structure

```text
apps/docs/          Vocs documentation
packages/contracts/ ENS ABIs, fragments, interfaces, and deployments
packages/core/      Standalone ENS actions and Effect APIs
packages/sdk/       Config-bound, grouped SDK
packages/react/     Providers, hooks, atoms, and cache APIs
packages/hca/       Pimlico and Rhinestone execution adapters
packages/test-env/  Private deterministic ENS integration environment
packages/template/  Starter for new packages
```

Keep changes within the package that owns the behavior. Shared public types belong with their domain
in Core, while implementation details should remain internal.

## Development checks

Run the complete local check before opening a pull request:

```sh
pnpm check
pnpm pack:check
pnpm test:packages
```

These commands cover formatting, linting, type checking, unit tests, builds, public type performance,
package metadata, exports, and clean consumer installations.

During development, run a focused package command when it provides a faster feedback loop:

```sh
pnpm --filter @ensforge/core test
pnpm --filter @ensforge/core typecheck
pnpm --filter @ensforge/react test:watch
pnpm --filter @ensforge/docs dev
```

## Contract integration tests

Integration tests run against a pinned Docker image containing deterministic ENSv1 and ENSv2 Anvil
deployments. Docker must be running locally.

```sh
pnpm build:devnet
pnpm test:integration
```

The test environment starts once for the suite, seeds its fixtures, and resets chain state between
tests. Local runs use the pinned local image by default. CI pulls a prebuilt image. To reuse a
published image locally, authenticate with GHCR if needed and set `ENSFORGE_TEST_IMAGE` to its
digest. See [test environment setup](packages/test-env/README.md).

Live read-only smoke suites verify the public deployments separately. They require provider URLs and
never submit transactions. The commands automatically load a root `.env` file when present:

```sh
ENSFORGE_MAINNET_RPC_URL=https://… pnpm test:live:mainnet
ENSFORGE_SEPOLIA_RPC_URL=https://… pnpm test:live:sepolia
```

The indexer smoke tests use the public defaults. To avoid community endpoint rate limits, override
them with authenticated or dedicated endpoints when available:

```bash
ENSFORGE_MAINNET_V1_SUBGRAPH_URL=https://…
ENSFORGE_SEPOLIA_V1_INDEXER_URL=https://…
ENSFORGE_SEPOLIA_V2_INDEXER_URL=https://…
```

`ENSFORGE_MAINNET_V1_INDEXER_URL` remains supported as a compatibility alias.

The Sepolia suite uses `ENSFORGE_SEPOLIA_V2_NAME` when set and otherwise reads the public
configured fixture tree. Follow the [Sepolia deployment guide](https://ensforge.com/core/guides/sepolia-deployment)
when creating your own fixtures. `pnpm setup:sepolia-v2` previews the setup; `pnpm setup:docs-sepolia`
applies it and sends transactions. Use a dedicated test wallet and never commit its keys.

When adding an action, cover domain logic with focused unit tests and contract behavior with an
integration test when the behavior depends on deployed bytecode or chain state. Use `@effect/vitest`
for Effect-based tests and preserve the existing test folder conventions.

## Documentation

Update documentation when changing a public API, configuration option, return type, error, deployment,
or package entrypoint. Preview the site at `http://localhost:3000`:

```sh
pnpm --filter @ensforge/docs dev
```

Keep examples runnable against public exports. Detailed API documentation belongs in `apps/docs`;
package READMEs should remain useful introductions.

## Commits and pull requests

Use small [Conventional Commits](https://www.conventionalcommits.org/) with clear scopes when useful:

```text
feat(core): add resolver action
fix(react): preserve mutation failure state
docs(sdk): explain Wagmi configuration
```

A pull request should explain the behavior being changed and include appropriate tests. Avoid
unrelated refactors in the same change. Changes to `main` require one code-owner approval from
@envoy1084. The maintainer bypass team lets the sole maintainer integrate their own changes.
Force pushes and deletion of `main` remain blocked, including for that team.

The full CI suite is manually dispatched by a maintainer before release; it is not a required PR
status check. CodeQL and dependency review run separately as security checks. Contributors should
run the relevant local checks and report their results in the PR. Dependency updates, especially
wallet, signing, and account-abstraction libraries, require review and are not automatically merged.

Do not add live wallet keys or provider credentials to PR workflows. Report vulnerabilities through
[private security reporting](https://github.com/thenamespace/ensforge/security/advisories/new), not
public issues. See [SECURITY.md](SECURITY.md) for the reporting policy.

## Changesets

Add a changeset for every user-visible change to a published package:

```sh
pnpm changeset
```

Choose the affected packages and describe the change from a package user's perspective. The public
packages use a fixed version group, so Changesets releases `@ensforge/contracts`, `@ensforge/core`,
`@ensforge/sdk`, `@ensforge/react`, and `@ensforge/hca` together. Tests, documentation-only changes, and private
workspace packages generally do not require a changeset.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
