# `@ensforge/test-services`

ensforge against the off-chain services it talks to, run locally in Docker against the devnet:
the bigname indexer, Pimlico's alto bundler and a paymaster (not published). Run with
`pnpm test:services`; it needs Docker and Foundry (see [`tests/devnet`](../devnet/README.md)).
Maintainers and release CI run it; it is not part of `pnpm check`.

## The stack

Each test file starts its own stack with `Services.layer({ profile, services })` and stops it when
the file ends (`test/stack/stack.ts`). Indexers cannot follow `evm_revert`, so nothing in this lane
is reverted: every test writes its own names.

- **Devnet**: the profile's seeded anvil, answering as Sepolia (chain id 11155111, the only test
  chain bigname knows) and listening for the containers on `host.docker.internal`.
- **`indexer`**: Postgres 16 and bigname v0.14.11 (phase runner and API), with a SELECT-only role
  for the API. Release images only run the manifest profiles compiled into them, so bigname is
  built from source (`bigname/Dockerfile`) with a profile generated from the devnet's deployment
  ledger (`test/stack/manifests.ts`). The checkout and image are cached in `.cache/` and rebuilt
  when the Dockerfile or the profile change. `waitForIndexed()` waits for the latest block.
- **`aa`**: EntryPoint v0.7 helpers (Pimlico's mock-aa-environment deployer), alto v1.2.8 and an
  ERC-7677 paymaster that sponsors every UserOperation (`aa/`). The paymaster follows the devnet's
  clock, which runs ahead of real time. alto runs without safe mode (KL-51).

Images are pinned by digest (`test/stack/images.ts`, `compose.yml`, the Dockerfiles) and pulled
anonymously. The first run builds bigname (several minutes; 20–30 on a cold CI runner); later runs
reuse the image. With `ENSFORGE_BIGNAME_REGISTRY` set (CI sets it), the stack first pulls the same
build, tagged by its fingerprint, from that registry; the `bigname-image` workflow publishes it.

## What runs

- `test/indexer/fixtures.test.ts`: every fixture's name and records read from the chain and from
  bigname at the block bigname indexed; alias paths, expired subnames and CCIP-free verification.
  Differences by design are listed in `test/indexer/differences.ts`; that list only shrinks.
- `test/indexer/writes.test.ts`: ensforge writes (registration, records, subnames, roles,
  transfers, resolvers), then bigname's answer; migration discovery through the indexer.
- `test/indexer/differential.test.ts`: the fuzz lane's random operation sequences, applied without
  reverts, then every name they touch compared with `test/indexer/compare.ts`. Known bigname
  behaviours are tagged there with their reason; any other difference fails.
- `test/hca/bundler.test.ts`: HCA executions as owner-signed UserOperations through alto, paid by
  the HCA or the paymaster, and classified rejections.
- `test/journeys`: what people do with ensforge, end to end: a new user's profile, a profile
  manager, a team's subnames, a name's lifecycle, an interrupted and resumed migration, an HCA
  migration, a DNS import, wallet bundles, a gasless renewal and an app on the `Ensforge` service.

## Budgets

| Variable                | Default    | Meaning                                               |
| ----------------------- | ---------- | ----------------------------------------------------- |
| `ENSFORGE_INDEXER_RUNS` | `5`        | Random sequences the indexer differential applies.    |
| `ENSFORGE_FUZZ_SEED`    | `20261117` | Their seed, as in the fuzz lane (`random` picks one). |
| `ENSFORGE_FUZZ_LENGTH`  | `30`       | Commands per sequence, at most.                       |

A failure prints its seed and the sequence; rerun with the same seed to reproduce it.

## When a run hangs or fails

- A stack that does not come up within five minutes fails with the services' last log lines.
- An interrupted run can leave containers behind; remove them with
  `docker compose -p <project> down --volumes` (projects are named `ensforge-<pid>-<port>`).
- `docker logs <project>-alto-1` shows each UserOperation's fate; a bundle reverting on-chain is
  retried by alto until the executor's `timeout` (`HCA_EXECUTION_TIMEOUT`).
