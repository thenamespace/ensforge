# `@ensforge/test-integration`

ensforge's read actions against the seeded fixtures of
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
  client, optionally with an account or CCIP-Read settings), `isolated` and `atTimestamp`
  (snapshot, act, revert).
- `test/support/expect.ts`: name-state expectations that differ by stage (ENSv1 only, before and
  after the ENSv2 launch).
- `test/support/gateway.ts`: an in-process CCIP-Read gateway. viem follows only HTTP(S) gateways,
  so fixtures with `data:` URLs are pointed at it.

Tag each test with the catalog cases it covers (`meta: { cases }`) and list it in
`tests/fixtures/catalog/ledger.json`. Expected values come from fixture facts or raw contract
reads, never from ensforge. Raw writes in a test await their receipt and run inside `isolated`.

ENSv1 resolver, record and primary-name behaviour runs on `v1-live` and on `mainnet-shaped`, where
premigrated names resolve through the ENSv1 bridge. Profiles start from a state dump, so reads
before the dump's block (e.g. before ENSv2 was deployed) are not possible.
