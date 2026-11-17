# Ensforge repository guide

Ensforge is a pnpm and Turborepo monorepo for Effect-native Ethereum Name Service packages.

## Workspace map

- `packages/contracts`: runtime-neutral ENS ABIs, interfaces, addresses, and deployment metadata.
- `packages/sdk`: framework-independent SDK client, types, services, and actions.
- `apps/*`: runnable applications when a concrete application is introduced.
- `packages/*`: additional publishable packages when they have an independent public boundary.

Dependencies must point inward toward `@ensforge/sdk`. Framework adapters may depend on the sdk; the
sdk must not depend on React or application runtimes.

## Commands

- `pnpm check`: formatting, linting, type checking, tests, and builds.
- `pnpm format`: format the workspace with Oxfmt.
- `pnpm changeset`: record a publishable package change.

Use the Klarity presets already configured at the workspace root. Do not add Prettier, ESLint, Husky,
lint-staged, tsup, or Rollup unless a demonstrated requirement cannot be met by the existing tools.

## Readability

Apply these conventions across all package source, including the SDK, HCA, React, contracts, and
new packages. Oxfmt does not insert logical blank lines; review grouping explicitly when writing code.

Separate validation, execution, state updates, and result construction with blank lines. Keep short,
related declarations and assertions together; do not add a blank line after every statement. Separate
independent functions and type declarations, while keeping overloads and schema/type pairs together.

Use brief comments for non-obvious constraints, ordering, or lifecycle decisions. Avoid comments that
repeat the code, section banners, roadmap phase labels in source comments, and manual reformatting
of generated artifacts.

Inline trivial wrappers such as a function that only constructs an error or forwards a call. Prefer
an explicit expression at its use site when a small helper adds navigation without clarifying intent.
Keep shared functions for substantial reused logic or important domain concepts; do not extract
one-off helpers merely to shorten a function. Preserve existing public APIs when cleaning up.

Keep each public action in its own action folder, following neighboring actions. Separate validation,
RPC/provider work, mutation, and result construction; group related declarations without inserting
a blank line after every line.

Defer HCA user documentation until the final documentation phase. Write it in `apps/docs`, not in
package guides or action README files. Keep the existing research roadmap for implementation tracking.

# Learning more about Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow
the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the guide does not cover,
search through the source code in `node_modules/effect/src`.
