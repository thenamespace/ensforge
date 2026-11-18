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
tests/fixtures/     Name states seeded on the devnet, edge-case catalog and coverage ledger
tests/integration/  ensforge's reads and writes against the fixtures
tests/fuzz/         Random operation sequences, on-chain properties, viem and ensjs comparison
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

CI runs the same (`pnpm ci:check`, then `pnpm pack:check`). `pnpm check` covers formatting, linting, type checking (sources and tests), builds, the fast tests,
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

Tests call ensforge through its Effect API: `yield* Actions.record.get(ens, options)` with
`Actions` from `@ensforge/sdk/effect` (`@ensforge/hca/effect` for HCA), not
`Effect.promise(() => ens.record.get(options))`. Failures then stay typed: assert them with
`expectFailure(effect, { _tag, code })` from `@ensforge/test-harness`, settle them with
`Effect.result`, and stop a running write by interrupting its fiber. A wrapped Promise turns every
failure into a defect, which hides errors the Effect API leaks as defects. Only tests that compare
the Promise forms with the Effect ones use the Promise API (`expectRejection` asserts a rejected
Promise): the conformance suites, `reads/every-read.test.ts`, and tests of Promise-only features
such as `signal` or the `.request` builders `batch` takes. Wrap viem and other non-ensforge calls
in `Effect.promise`.

- Every test lives under `tests/`. Fast tests are in `tests/unit/<package>/<area>/*.test.ts`
  and `tests/unit/<package>/types/*.test-d.ts`; they reach package internals through the
  workspace-only `@ensforge/<package>/internal/*` export, never touch the network and run on every
  pull request (`pnpm test`).
- Suites that need a chain or services live in private packages under `tests/` and are run by
  maintainers and release CI. Shared setup, matchers, transports and arbitraries live in
  `tests/harness`.
- `tests/devnet` deploys ENS on a local anvil (Foundry, see its README); `tests/fixtures` seeds
  every name state on it and holds the edge-case catalog and coverage ledger; `tests/integration`
  checks ensforge's reads and writes against them. `pnpm test:chain` runs the chain lane.
  `tests/fuzz` runs random operation sequences against a model, on-chain properties and a
  comparison with viem and ensjs (`pnpm test:fuzz`, see its README). `tests/services` runs
  ensforge against bigname, alto and a paymaster in Docker, and the end-to-end journeys
  (`pnpm test:services`, see its README). Tag tests with the
  catalog cases they cover (`meta: { cases: ["O08"] }`) and list them in
  `tests/fixtures/catalog/ledger.json`.
- Every error code an action documents in `@throws` must be asserted by a test that names the
  action (`tests/unit/sdk/conformance/throws-coverage.test.ts`, which lists the few still
  open), and every contract error the SDK maps must be raised by a devnet contract in
  `tests/integration/test/writes/reverts.test.ts` (`revert-map.test.ts` lists the rest).
- An action fails only with the errors it declares. Codegen writes each action's `ErrorType`
  from its `@throws` classes plus `Errors.CommonError` (`Errors.WriteError` for writes and their
  `…Sync` forms; `Errors.AnyError` names any class, for `plan.send`), and types its Effect error
  channel with it. The shared RPC and revert translation are typed `AnyError`, so the unit, chain,
  fuzz and services lanes check it at runtime: `tests/harness/src/error-types.ts` records every
  error an action fails with through the Effect and Promise APIs and fails the test file when one
  is outside the action's `ErrorType`. Document a missing class in `@throws` (and run codegen)
  rather than widening the type. `expectFailure` also rejects, at compile time, an expected
  literal `_tag` the effect does not declare. `ENSFORGE_ERRORS_LOG=<file>` appends every observed
  `{ path, tag, code }` as JSON lines.

Property tests use a fixed seed; reproduce a failure with `ENSFORGE_TEST_SEED=<seed> pnpm test`.

Mutation testing ([Stryker](https://stryker-mutator.io)) checks that the tests notice behaviour
changes in the write path: the send and route runtime (`internal/write`, `internal/action/write.ts`),
the plan actions and the HCA route and executors. `pnpm test:mutation` runs the SDK and HCA unit
tests against each mutant; `pnpm test:mutation:chain` runs the devnet write tests against
`send.ts` and `via.ts` (slow; Foundry). Both work in a sandbox copy under `.stryker-tmp/`, so they
never change the sources, and write their reports to `reports/mutation/`. Turn a surviving mutant
into a test, or explain in the pull request why it is equivalent. Mutate other modules with
`pnpm test:mutation --mutate <glob>` (for example `packages/sdk/src/internal/permission/*.ts`).
Configs: `.config/stryker.config.json` and `.config/stryker.chain.config.json`, with the Vitest
configs they name.

### Commands

| Command                                      | Runs                                                            | Needs                 |
| -------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| `pnpm test`                                  | unit and type tests (part of `pnpm check`)                      | nothing               |
| `pnpm test:chain`                            | devnet, fixtures and integration lanes                          | Foundry               |
| `pnpm test:fuzz`                             | fuzz lane                                                       | Foundry               |
| `pnpm test:services`                         | bigname, alto, paymaster and journeys                           | Foundry, Docker       |
| `pnpm test:fork`                             | real names on mainnet and Sepolia forks at pinned blocks        | Foundry, archive RPCs |
| `pnpm test:live`                             | read-only canaries, indexers and proxies on mainnet and Sepolia | RPCs                  |
| `pnpm test:mutation`                         | mutation testing of the write path on the unit lanes            | nothing               |
| `pnpm test:mutation:chain`                   | mutation testing of `send.ts` and `via.ts` on the chain lane    | Foundry               |
| `pnpm devnet:build` / `devnet:verify`        | build (cache) and check devnet profiles                         | Foundry               |
| `pnpm artifacts:check` / `artifacts:refresh` | committed contract artifacts against their pinned sources       | network               |
| `pnpm release:watch`                         | newer ENS releases or deployments, and indexer OpenAPI drift    | network               |

The fork and live lanes read `ENSFORGE_MAINNET_RPC_URL` and `ENSFORGE_SEPOLIA_RPC_URL` from the
environment or `.env` (`.env.example`). They are throttled for a rate-limited RPC (forks at 80
compute units a second, cached in `~/.foundry/cache/rpc`; live reads 250 ms apart) and run one
file at a time: never run them alongside each other. Both keep to a few essential checks; new
coverage belongs on the devnet.

Flaky tests are not retried. A test that fails without a code change is quarantined (`it.skip`
with a link to its issue and the seed or block that reproduces it) and fixed or removed; a lane is
green when it passes three consecutive runs.

## Documentation

Update documentation when changing a public API, configuration option, return type, error, deployment,
or package entrypoint: the TSDoc on the export (with examples, which `verify` type-checks), the
package README, and the API report (`pnpm --filter <package> api:report`). Package READMEs stay short
introductions; the documentation site comes later.

## API stability

Every public export (everything reachable from a package's published entries: values, types,
namespaces and re-exports) has a `@stability` tag in its JSDoc. `ensforge-dev lint-jsdoc` (part of
`verify`) fails on a missing or unknown tag and names the export and the file the tag belongs in.
API reports mark every export that is not stable.

| Tag            | Promise under semver                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable`       | Breaking changes (removal, renaming, stricter options, wider return or error types, changed behaviour) only in a major release, after a deprecation in a minor one.                                                  |
| `experimental` | A complete feature whose design may still change with the protocol or services it depends on (ENS HCAs, bundlers, Rhinestone). Breaking changes can land in a minor release, described in its changeset.             |
| `unstable`     | Building blocks for adapters and extension packages, or APIs built on Effect's unstable modules. They can change or be removed in any minor release, described in its changeset. Patch releases never break any tag. |

Today `@ensforge/hca`, `@ensforge/contracts/v2/experimental/hca` and `Deployments.V2Hca` are
experimental; the own exports of `@ensforge/sdk/extension` and React's Effect Atom layer (the atoms,
their keys, `invalidate`, the server helpers and `HydrationBoundary`) are unstable. Promoting an
export to `stable` is a minor change with a changeset.

Write the tag on the declaration, before `@category` and `@since`. Exceptions: a namespace re-export
(`export * as Errors from`) is tagged on that statement, and so is a dependency's export re-exported
with `export { … } from`; types in a function's namespace (`getText.Options`) share the function's
tag. Codegen writes the tags of generated namespaces and decorators: a domain is as stable as its
most stable action.

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

CI checks every pull request (see [Continuous integration](#continuous-integration)); the chain,
fuzz and services lanes run in the extended workflow and in every release. CodeQL and dependency review run separately as security checks. Contributors should
run the relevant local checks and report their results in the PR. Dependency updates, especially
wallet, signing, and account-abstraction libraries, require review and are not automatically merged.

Do not add live wallet keys or provider credentials to PR workflows. Report vulnerabilities through
[private security reporting](https://github.com/thenamespace/ensforge/security/advisories/new), not
public issues. See [SECURITY.md](SECURITY.md) for the reporting policy.

## Continuous integration

Workflows live in `.github/workflows`; the shared pieces are the composite actions
`.github/actions/setup` (Node from `.node-version`, pnpm from `packageManager`, frozen install,
optional pnpm cache and `ignore-scripts`) and `.github/actions/setup-foundry` (Foundry at
`tests/devnet/foundry-version`, with caches for the devnet profile dumps and anvil's fork cache),
and the reusable workflows `_check.yml` and `_lanes.yml`.

| Workflow               | Runs                                                                                                                       | Trigger                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `ci.yml`               | `_check.yml`: `pnpm ci:check`, `pnpm pack:check`, and a [zizmor](https://docs.zizmor.sh) audit of the workflows            | pull requests, `main`, merge queue, manual |
| `pr-title.yml`         | the PR title as a Conventional Commit with commitlint's types                                                              | pull requests                              |
| `changeset-status.yml` | the packages the PR releases, in the job summary (never fails)                                                             | pull requests                              |
| `extended.yml`         | `_lanes.yml`: `chain`, `fuzz`, `services`, `mutation`, `mutation-chain` or `all`, with an optional seed and fuzz run count | manual                                     |
| `networks.yml`         | `_lanes.yml` with the RPC secrets: `fork`, `live` or `watch` (`pnpm release:watch`), one at a time                         | manual, default branch                     |
| `release.yml`          | the release (below)                                                                                                        | manual, default branch                     |
| `release-smoke.yml`    | published packages against the archives a release verified                                                                 | manual                                     |
| `bigname-image.yml`    | the services lane, then its bigname images to `ghcr.io/<owner>/ensforge-bigname-devnet`, which the services lanes pull     | manual, default branch                     |

Lanes upload their logs, JUnit reports, fuzz corpus and mutation reports as an artifact named
`lane-<lane>-<run>-<attempt>` for 14 days; the network lanes redact the RPC URLs from them first.
Only `networks.yml` receives secrets (`ENSFORGE_MAINNET_RPC_URL`, `ENSFORGE_SEPOLIA_RPC_URL`, as
repository secrets). Jobs get the least permissions they need, check out without persisted
credentials (except the changeset status, which fetches the PR head with read-only ones), and
have timeouts. Actions are referenced by version tag, the major tag where the action publishes one
(`changesets/action` and `zizmor-action` have none, so they name a release); Dependabot proposes
new versions weekly, a week after their release. Check workflow changes locally with
`docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12` and
`docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/zizmorcore/zizmor:1.32.0 --config .github/zizmor.yml .`.

Required status checks (repository settings, branch protection or ruleset for `main`): `check / check`
and `check / zizmor` from CI, `title` from PR title and `status` from Changeset status (which
never fails: it only reports).
Turn on the merge queue there too if wanted; CI runs on `merge_group`. In Settings → Actions →
General, allow GitHub Actions to create pull requests (the release opens the version PR).

## Changesets

Add a changeset for every user-visible change to a published package:

```sh
pnpm changeset
```

Choose the affected packages and describe the change from a package user's perspective. The public
packages use a fixed version group, so Changesets releases `@ensforge/contracts`, `@ensforge/sdk`,
`@ensforge/react`, and `@ensforge/hca` together. Tests, documentation-only changes, and private
workspace packages generally do not require a changeset.

## Releases

Releases run in `release.yml`, dispatched from `main` (Actions → Release → Run workflow), and
publish with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): the workflow
proves its identity to npm with a GitHub OIDC token, so no npm token exists anywhere, and npm
attaches provenance to each version.

1. **Dry run** (the default): versions the packages inside the runner (a temporary patch changeset
   when none are pending), runs `pnpm release:prepare` (`pnpm check` and the chain, fuzz and
   services lanes), packs with `changeset pack` and runs `pnpm release:check` on the archives.
   Nothing is pushed or published. Do this first.
2. **Version PR**: run it again with _dry run_ unchecked. With pending changesets it opens or
   updates the `chore(release): version packages` PR (`pnpm release:version`: versions,
   changelogs, lockfile, formatting). Review and merge it; GitHub does not run CI on PRs the
   workflow opens, so run CI on its branch manually first.
3. **Publish**: run it once more, not a dry run, on the merged version commit. It prepares and
   packs the publish plan, checks the archives (`release:check` writes `verification.json` and the
   job confirms the archives did not change), then publishes those same archives with provenance,
   pushes the tags and creates the GitHub releases. The prepare job's summary lists the run ID and
   the packed artifact ID (kept 30 days).
4. **Smoke check**: once npm serves the versions, dispatch `release-smoke.yml` with that run ID and
   artifact ID (the publish summary prints the `gh workflow run` command). It checks that the run
   was a successful release from `main` that published, downloads its packed artifact and runs
   `pnpm release:smoke --pack-dir <dir> --provenance`: npm's integrity and the registry tarballs
   equal the packed archives, and each version's SLSA provenance names that archive and this
   repository's `release.yml`.

The same commands run locally after versioning: `pnpm release:pack --out-dir <dir>` builds and
packs the unpublished versions, `pnpm release:check --pack-dir <dir>` verifies them (publint, attw,
each package's contents — readme, license, changelog, the sources its maps name, nothing secret or
pnpm-only — an app that installs the tarballs and imports and type-checks every entry, bundle budgets), and
`pnpm release:smoke --pack-dir <dir> [--provenance]` compares npm with them.

### npm trusted publisher setup

Once per package, on npmjs.com, for `@ensforge/contracts`, `@ensforge/sdk`, `@ensforge/hca` and
`@ensforge/react`: package → Settings → Trusted publishing → GitHub Actions, with organization
`thenamespace`, repository `ensforge`, workflow filename `release.yml` and no environment. Then,
under Publishing access, require two-factor authentication and disallow tokens, so only the
workflow can publish. A new package must be published once by hand before it can be configured.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
