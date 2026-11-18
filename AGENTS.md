# Ensforge repository guide

Ensforge is a pnpm and Turborepo monorepo for Effect-native Ethereum Name Service packages.

## Workspace map

- `packages/contracts`: runtime-neutral ENS ABIs, interfaces, addresses, and deployment metadata.
- `packages/sdk`: framework-independent SDK client, types, services, and actions.
- `apps/docs`: the documentation site and blog (`@ensforge/docs`, private): TanStack Start,
  Fumadocs and Tailwind, served by Node from a Docker image (`apps/docs/Dockerfile`, deployed by
  `deploy-docs.yml`). Content lives in `apps/docs/content`; docs code blocks marked `twoslash`
  compile against the workspace packages' built types.
- `apps/*`: other runnable applications when a concrete application is introduced.
- `packages/*`: additional publishable packages when they have an independent public boundary.

Dependencies must point inward toward `@ensforge/sdk`. Framework adapters may depend on the sdk; the
sdk must not depend on React or application runtimes.

## Commands

- `pnpm check`: formatting, linting, type checking, builds, verify, bundle budgets and tests.
- `pnpm format`: format the workspace with Oxfmt.
- `pnpm changeset`: record a publishable package change.

Use the Klarity presets already configured at the workspace root. Packages build with TypeScript 7's
`tsc` (`ensforge-dev build`, from `tools/cli`), which keeps `export * as` re-exports tree-shakeable; tsdown's
unbundled output did not. Do not add Prettier, ESLint, Husky, lint-staged, tsup, or Rollup unless a
demonstrated requirement cannot be met by the existing tools. Pin every external dependency in the
pnpm catalog. Tool configs live in `.config/`; repository scripts are `ensforge-dev` commands in
`tools/cli`, written with Effect.

`tsc` is patched with the Effect language service (`@effect/tsgo`), so typecheck reports Effect
diagnostics. Fix them in the code rather than silencing them; disable one with an
`@effect-diagnostics-next-line` comment only when the flagged pattern is the point of the code.
`pnpm install` also patches oxlint (`effect-tsgo patch --oxlint`): lint is type-aware and runs the
`@effect/tsgo` oxlint presets, whose rules `tsc` does not run. Silence those the same way, with a
one-line reason and `// oxlint-disable-next-line effecttsgo/<rule>` (an `@effect-diagnostics`
comment for a rule `tsc` does not run fails typecheck as having no effect). Unstable and
experimental APIs used on purpose are allowlisted per package (`allowedUnstableApis`,
`allowedExperimentalApis` in its tsconfig).

## Code guidelines

These apply to all code: the SDK, HCA, React, contracts, tools and tests. Oxfmt does not insert
logical blank lines; review grouping explicitly when writing code.

### Structure and naming

- Name things for what they are in the domain, consistently across the repository: one name per
  concept (`fixtures.byId`, `services.indexerUrl`), not synonyms per file.
- Prefer Effect services (`Context.Service` with a static `layer`, methods built with
  `Effect.fn`/`Effect.fnUntraced`) over free functions that take a client or instance as their
  first argument. Shared behaviour belongs in a service other code yields. The one exception is
  the packages' public actions and the internal modules behind them: they take the client first
  (`Actions.record.get(ens, options)`), which keeps them tree-shakeable and shared by the Promise
  and Effect APIs.
- Use what exists before writing a helper: viem, Effect (`Predicate`, `Schema`, `Array`, …), the
  SDK's own utilities (`Name.parse`, `CoinType`, `Role`), then the shared test services. When a
  helper is missing and generally useful, add it to the package that owns the concept, with tests.
- Keep each public action in its own action folder, following neighboring actions. Keep each file
  to one responsibility.

### Helpers and inlining

- Inline one-off logic at its use site. Do not declare small helpers, constants or fixtures at the
  top of a file when they are used once or twice in that file: a reader should not have to jump
  around to follow a test or a function.
- Extract only substantial logic, or logic reused across files, into a shared module with a
  specific name; never into catch-all `utils`/`helpers` files.
- Inline trivial wrappers: a function that only constructs an error, forwards a call, or wraps an
  assertion (`const fails = (e) => expectFailure(e, …)`) adds navigation without clarifying intent.
- Preserve existing public APIs when cleaning up.

### Grouping and comments

- Separate logical blocks with a blank line: setup, validation, execution (RPC or provider
  work), state updates, assertions and result construction. Keep short, related declarations and
  assertions together; do not add a blank line after every statement. Separate independent
  functions and type declarations, keeping overloads and schema/type pairs together.
- Use brief comments for non-obvious constraints, ordering or lifecycle decisions. Avoid comments
  that repeat the code, section banners, roadmap phase labels, and manual reformatting of
  generated artifacts.

Defer HCA user documentation until the final documentation phase. Write it in `apps/docs`, not in
package guides or action README files. Keep the existing research roadmap for implementation
tracking.

## Tests

- All tests live under `tests/`: unit tests in `tests/unit/<package>`, the chain, fuzz and
  services lanes beside them. Unit tests reach package internals through the workspace-only
  `@ensforge/<package>/internal/*` export.
- Tests are Effect programs (`it.effect`, `layer(...)` from `@effect/vitest`). Call ensforge
  through its Effect API (`yield* Actions.record.get(ens, options)`, `Actions` from
  `@ensforge/sdk/effect` or `@ensforge/hca/effect`) and assert failures with `expectFailure`.
  Reach the chain, wallets, gateways, indexers and bundlers through the shared test services; do
  not write `Effect.promise`/`async` in tests. Only the conformance tests that compare the Promise
  API with the Effect API call Promises.
- Write the tests a behaviour needs: the documented contract, its failure cases and regressions.
  Do not add tests that restate the implementation, check what the type checker already proves,
  or assert the obvious.
- See the Tests section of CONTRIBUTING.md for lanes, fixtures and the coverage ledger.

# Learning more about Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow
the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the guide does not cover,
search through the source code in `node_modules/effect/src`.
