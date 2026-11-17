# `@ensforge/test-integration`

ensforge's read and write actions against the seeded fixtures of
[`@ensforge/test-fixtures`](../fixtures/README.md) on every devnet profile (not published). Run
with `pnpm test:chain`; it needs Foundry (see [`tests/devnet`](../devnet/README.md)).

## Writing a test

```ts
onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
  it.effect(
    "…",
    () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);
        const state = yield* call(() => ens.name.get({ name: fixtures.byId("v2.grace").name }));
      }),
    { meta: { cases: ["M:A15"] } },
  );
});
```

- `test/support/chain.ts`: `onProfile` (one seeded devnet per file, real time), `ensforge` (a
  client, optionally with an account, wallet, plan storage or CCIP-Read settings), `isolated` and
  `atTimestamp` (snapshot, act, revert), and `passWaits` (an `onStep` that moves time past a
  plan's waits, such as the commitment age).
- `test/support/wallet.ts`: `testWallet`, an EIP-1193 wallet over an anvil account with EIP-5792
  `wallet_sendCalls` (atomic or not), rejections on demand, and a record of what it was asked.
- `test/support/expect.ts`: name-state expectations that differ by stage (ENSv1 only, before and
  after the ENSv2 launch).
- `test/support/gateway.ts`: an in-process CCIP-Read gateway. viem follows only HTTP(S) gateways,
  so fixtures with `data:` URLs are pointed at it.

Tag each test with the catalog cases it covers (`meta: { cases }`) and list it in
`tests/fixtures/catalog/ledger.json`. Expected values come from fixture facts or raw contract
reads, never from ensforge. Raw writes in a test await their receipt and run inside `isolated`.

Writes run on `mainnet-shaped`, each inside `isolated`, and assert the chain state with raw
reads. `test/writes/cases.ts` holds one allowed case per write action, which
`writes/conformance.test.ts` sends in every mode; `writes/access-matrix.test.ts` sends them as
other accounts. `writes/errors.test.ts` asserts that each documented refusal is typed and comes
before the wallet is asked, and `writes/reverts.test.ts` raises each contract error the SDK maps
from a deployed contract. `packages/sdk/test/unit/conformance/throws-coverage.test.ts` and
`revert-map.test.ts` fail when a documented code or mapped error has no such test and is not in
their shrink-only lists.

ENSv1 resolver, record and primary-name behaviour runs on `v1-live` and on `mainnet-shaped`, where
premigrated names resolve through the ENSv1 bridge. Profiles start from a state dump, so reads
before the dump's block (e.g. before ENSv2 was deployed) are not possible.
