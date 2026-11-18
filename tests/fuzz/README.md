# `@ensforge/test-fuzz`

Random sequences of real ENS operations, run with ensforge on the `mainnet-shaped` devnet and
checked against a small model, plus property and differential checks (not published). Run with
`pnpm test:fuzz`; it needs Foundry (see [`tests/devnet`](../devnet/README.md)).

## What runs

- `test/sequences/sequences.test.ts`: random command sequences. Each command is an ensforge write
  (register, renew, transfer, records, resolver, roles, operators, subnames, wrapper and fuses,
  primary names, migration) or a jump in time to just before, at or after an expiry or grace end.
  The model predicts each write's outcome: success, or one of a few typed refusals. After every
  command these invariants are checked:
  - **State**: `name.get`, `record.getText` and `primaryName.get` equal the model.
  - **Permission oracle**: for a sampled name, operation and account, `permission.check` allows
    the operation exactly when simulating the write succeeds.
  - **Resolution**: `record.getText` equals viem's Universal Resolver lookup and the resolver's own
    record.
  - **Libraries**: ensforge reads a sampled name and primary name as viem and ensjs do.
  - **Migration**: `migration.get` predicts whether migrating simulates.
  - **Plans**: a single-step write uses no more gas than `.estimateGas` reported.

  Every failure must be a typed ensforge error. Each sequence runs in a snapshot that is reverted.

- `test/sequences/corpus.test.ts` replays `corpus/*.json`: shrunk sequences that once found a bug,
  kept as regression tests.
- `test/properties`: ensforge's pure code against values the contracts compute:
  - names and DNS encoding, through NameCoder in the Universal Resolver;
  - registration commitments, through `ETHRegistrar`;
  - resolver addresses, through `VerifiableFactory`;
  - role bitmaps, through `hasRoles`;
  - fuses, through `allFusesBurned`;
  - HCA session approvals (salt, session digest, permission id, multi-chain digest, owner
    signature), through `hca.sessionHashes`, a harness exposing the validator's internal hashing.
- `test/differential`: ensforge, viem's ENS actions and ensjs over every fixture on every profile.
  Each difference is either a bug that gets fixed, or listed in `documented.ts` with its reason.
  That list only shrinks.

## Budgets

| Variable                 | Default    | Meaning                                                                   |
| ------------------------ | ---------- | ------------------------------------------------------------------------- |
| `ENSFORGE_FUZZ_SEED`     | `20261117` | Seed of the sequence and property runs; `random` picks one and prints it. |
| `ENSFORGE_FUZZ_RUNS`     | `100`      | Sequences per run.                                                        |
| `ENSFORGE_FUZZ_LENGTH`   | `30`       | Longest sequence.                                                         |
| `ENSFORGE_PROPERTY_RUNS` | `50`       | Inputs per property.                                                      |

Release CI runs the defaults (about 30 seconds). Long campaigns are manual:

```sh
ENSFORGE_FUZZ_RUNS=5000 ENSFORGE_FUZZ_SEED=random pnpm test:fuzz
```

## When a sequence fails

The run shrinks the sequence and saves it to `corpus/<hash>.json`, with the seed and the failure.
Replay it with `pnpm test:fuzz -t corpus`, then decide:

- **ensforge bug**: fix it with a regression test, and keep the corpus file.
- **Model gap**: correct the model, which is usually a write's prediction in `test/commands` or
  the state check in `test/invariants`, and delete the file.

The model only predicts what the protocol documents. Where it cannot decide, such as an
operator's reach or a write within a minute of an expiry, it accepts any typed refusal, and the
invariants check the outcome instead.

## Checking that the fuzzer finds bugs

Plant a bug that sends a stranger past a permission check. The default budget must report it as
a permission-oracle failure, for example:

```ts
// packages/sdk/src/internal/permission/evaluate.ts, in `evaluateV2`'s `role`
(facts.v2.roles & Roles.registry[name]) === Roles.registry[name] || name === "setResolver";
```

Revert the change and delete the corpus file the run wrote.

## Mutation testing

Stryker runs from the repository root (`pnpm test:mutation`); see the Tests section of
CONTRIBUTING.md.
