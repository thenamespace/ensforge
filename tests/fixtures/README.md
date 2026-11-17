# `@ensforge/test-fixtures`

Every ENS name state ensforge's chain tests need, seeded on the devnet profiles of
[`@ensforge/test-devnet`](../devnet/README.md), plus the edge-case catalog and coverage ledger in
[`catalog/`](./catalog/README.md) (not published).

## Using fixtures

```ts
import { assert, layer } from "@effect/vitest";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

layer(Fixtures.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })("…", (it) => {
  it.effect("…", () =>
    Effect.gen(function* () {
      const fixtures = yield* Fixtures;
      const devnet = yield* Devnet;
      const locked = fixtures.one({ kind: "v1-wrapped", fuses: "CU+CT" });
      const desynced = fixtures.forCase("O08")[0];
      // locked.name, locked.facts.expiry, … ; devnet.client for time travel
    }),
  );
});
```

Select fixtures by tags, catalog case or ID, never by hard-coded names or addresses. Each entry
has `name`, `node`, `tags`, `cases` and `facts` (owners, resolvers, expiries as decimal strings).

## How fixtures are built

A fixture (`src/fixtures/*`) is a set of devnet steps: `prelaunch` (ENSv1 history, before the
profile's ENSv2 launch), `postlaunch`, `afterTime` (after the build's single 400-day clock jump),
and `check`, which asserts the final state with raw reads and fails the build otherwise. Names are
registered through the real controllers; the few states only reachable as another actor are
tagged `cheat`. Builders use raw contract calls, never ensforge.

Fixtures are seeded per profile (`seededOn`): ENSv1 states everywhere, ENSv2 states where ENSv2
exists, launch-dependent ones after the launch, and a capability-specific set on `sepolia-shaped`.
A seeded build is cached like a profile and is deterministic (`test/chain/determinism.test.ts`).

`pnpm test:devnet` seeds every profile; `pnpm test` runs the catalog and ledger check.
