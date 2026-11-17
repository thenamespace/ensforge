---
"@ensforge/sdk": major
---

ensforge 1.0: a rewrite of the SDK for ENSv1 and ENSv2. `@ensforge/core` is now `@ensforge/sdk`; the 0.x config-bound `@ensforge/sdk` client and every `./legacy` entry are removed.

- `Ensforge.create({ publicClient, walletClient })` with action groups added by `extend(ensActions())`, or standalone `Actions.<domain>.<action>(client, options)`; the same actions return `Effect`s from `@ensforge/sdk/effect`.
- 124 actions across names, records, resolvers, registration and renewal, subnames, registries, permissions, roles, approvals, primary names, the NameWrapper, DNS, migration to ENSv2, events and plans.
- Writes are plans: `.prepare`, `.simulate`, `.estimateGas`, EIP-5792 batching, resume after failures, `…Sync` variants that wait for receipts, pluggable routes (`via`) and paymasters.
- Pluggable indexers: `bigname()`, `goldsky()`, `fallback()` and `defineIndexer()` for lists, history and search.
- `Ensforge.fromWagmi` in `@ensforge/sdk/wagmi`, for wagmi 2 and 3.
- Typed errors with codes, hints and `Errors.describe` for UI copy.
