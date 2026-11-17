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
packages/sdk/       Standalone ENS actions and Effect APIs
packages/react/     Hooks, Effect Atom atoms and server rendering
packages/hca/       Hidden Contract Account route and executors
packages/template/  Starter for new packages
tests/harness/      Shared test harness for every test suite
```

Keep changes within the package that owns the behavior. Shared public types belong with their domain
in the SDK, while implementation details should remain internal.

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
pnpm vitest --project sdk:unit
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

Property tests use a fixed seed; reproduce a failure with `ENSFORGE_TEST_SEED=<seed> pnpm test`.

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

When changing viem compatibility, also check the minimum supported version against the packed
packages:

```sh
ENSFORGE_TEST_VIEM_VERSION=2.49.0 pnpm test:packages
```

This runs the Node, React/Wagmi, and HCA provider consumer checks with one viem version throughout
each temporary project.
