# Contributing to ensforge

Thanks for helping improve ensforge. Contributions to actions, contracts, integrations, tests, and
documentation are welcome.

## Prerequisites

- Node.js 26
- pnpm 12

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

`pnpm install` patches TypeScript 7 with the [Effect language service](https://github.com/Effect-TS/tsgo),
so `tsc` reports Effect diagnostics. In VS Code, install the TypeScript Native Preview extension;
the workspace settings point it at the patched compiler.

## Repository structure

```text
packages/contracts/ ENS ABIs, interfaces, roles and deployments
packages/sdk/       Standalone ENS actions and Effect APIs
packages/react/     Hooks, Effect Atom atoms and server rendering
packages/hca/       Hosted Contract Account route and executors
tests/harness/      Shared test harness for every test suite
tests/devnet/       ENS deployed on a local anvil for chain test suites
tools/cli/          ensforge-dev: builds, verify checks, codegen and bundle budgets
.config/            Lint, format, test, turbo and commit configuration
```

Keep changes within the package that owns the behavior. Shared public types belong with their domain
in the SDK, while implementation details should remain internal.

## Development checks

Run the complete local check before opening a pull request:

```sh
pnpm check
pnpm pack:check
```

`pnpm check` covers formatting, linting, type checking (sources and tests), builds, the fast tests,
and each package's `verify`: generated code, JSDoc lint, API reports, published types compiled by a
consumer, OpenAPI snapshots and every JSDoc example. `pnpm pack:check` validates package metadata
and exports. `pnpm check` also bundles typical imports and fails when one grows more than 5% over
`.config/bundle-budgets.json`; after an intended change, record new sizes with
`pnpm bundle:size --write`.

During development, run a focused package command when it provides a faster feedback loop:

```sh
pnpm exec vitest -c .config/vitest.config.ts --project sdk:unit
pnpm --filter @ensforge/sdk typecheck
```

## Tests

Tests use [`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest) only;
do not import `vitest` directly. `it.effect` runs Effect tests, `it.prop` / `it.effect.prop` run
property tests from Schemas or `effect/Arbitrary`.

- Fast tests sit next to their package: `packages/<pkg>/test/unit/<area>/*.test.ts` and
  `packages/<pkg>/test/types/*.test-d.ts`. They never touch the network and run on every pull
  request (`pnpm test`).
- Suites that need a chain or services live in private packages under `tests/` and are run by
  maintainers and release CI. Shared setup, matchers, transports and arbitraries live in
  `tests/harness`.
- `tests/devnet` deploys ENS on a local anvil (Foundry, see its README). `pnpm test:devnet` runs
  the chain lane.

Property tests use a fixed seed; reproduce a failure with `ENSFORGE_TEST_SEED=<seed> pnpm test`.

## Documentation

Update documentation when changing a public API, configuration option, return type, error, deployment,
or package entrypoint: the TSDoc on the export (with examples, which `verify` type-checks), the
package README, and the API report (`pnpm --filter <package> api:report`). Package READMEs stay short
introductions; the documentation site comes later.

## Commits and pull requests

Use small [Conventional Commits](https://www.conventionalcommits.org/) with clear scopes when useful:

```text
feat(sdk): add resolver action
fix(react): preserve mutation failure state
docs(hca): explain executors
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
packages use a fixed version group, so Changesets releases `@ensforge/contracts`, `@ensforge/sdk`,
`@ensforge/react`, and `@ensforge/hca` together. Tests, documentation-only changes, and private
workspace packages generally do not require a changeset.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
