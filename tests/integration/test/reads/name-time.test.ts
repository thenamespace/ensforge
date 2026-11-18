import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

/** `name.get` at each offset from the fixture's expiry, reduced to the fields that change with time. */
const timeline = Effect.fnUntraced(function* (fixtureId: string, offsets: readonly bigint[]) {
  const fixture = (yield* Fixtures).byId(fixtureId);
  const chain = yield* Chain;
  const { reader } = yield* Clients;
  const expiry = BigInt(String(fixture.facts["expiry"]));

  return yield* Effect.forEach(offsets, (offset) =>
    chain.atTimestamp(
      expiry + offset,
      Actions.name.get(reader, { name: fixture.name }).pipe(
        Effect.map((state) => ({
          status: state.status,
          owner: state.owner === null ? null : "owner",
          available: state.available,
          renewable: state.renewable,
        })),
      ),
    ),
  );
});

describe("name.get over time", () => {
  // Before the launch ENSv1 registers and renews: BaseRegistrar's grace includes its last second.
  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "an ENSv1 .eth name expires at its expiry and is released one second after grace",
      () =>
        Effect.gen(function* () {
          const grace = Duration.days(90);

          const states = yield* timeline("v1.unwrapped", [-1n, 0n, grace - 1n, grace, grace + 1n]);

          // The registrar token has no owner from its expiry on.
          const inGrace = { status: "grace", owner: null, available: false, renewable: true };
          assert.deepStrictEqual(states, [
            { status: "registered", owner: "owner", available: false, renewable: true },
            inGrace,
            inGrace,
            inGrace,
            { status: "expired", owner: null, available: true, renewable: false },
          ]);
        }),
      { meta: { cases: ["T01", "T02", "M:E1", "M:E2", "M:E3"] } },
    );

    // The wrapper's `.eth` expiry is the registrar's plus grace, and a token lives through it.
    it.effect(
      "a wrapped .eth name keeps its owner until one second after the wrapper expiry",
      () =>
        Effect.gen(function* () {
          const grace = Duration.days(90);

          const states = yield* timeline("v1.wrapped", [grace, grace + 1n]);

          assert.deepStrictEqual(states, [
            { status: "grace", owner: "owner", available: false, renewable: true },
            { status: "expired", owner: null, available: true, renewable: false },
          ]);
        }),
      { meta: { cases: ["T03"] } },
    );
  });

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "an ENSv2 .eth name is in grace from its expiry and available at grace end",
      () =>
        Effect.gen(function* () {
          const grace = Duration.days(28);

          const states = yield* timeline("v2.registered", [-1n, 0n, grace - 1n, grace]);

          const inGrace = { status: "grace", owner: null, available: false, renewable: true };
          assert.deepStrictEqual(states, [
            { status: "registered", owner: "owner", available: false, renewable: true },
            inGrace,
            inGrace,
            { status: "expired", owner: null, available: true, renewable: false },
          ]);
        }),
      { meta: { cases: ["T04", "T05", "M:E1", "M:E2", "M:E3"] } },
    );

    it.effect(
      "a premigrated ENSv1 name is reachable through ENSv2 until its reservation ends",
      () =>
        Effect.gen(function* () {
          const reserved = (yield* Fixtures).byId("v2.reserved");
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const reservedUntil = BigInt(String(reserved.facts["reservedUntil"]));

          const reachable = yield* Effect.forEach([reservedUntil - 1n, reservedUntil], (at) =>
            chain.atTimestamp(
              at,
              Actions.name
                .get(reader, { name: reserved.name })
                .pipe(Effect.map((state) => state.reachable)),
            ),
          );
          assert.deepStrictEqual(reachable, [true, false]);
        }),
      { meta: { cases: ["T07"] } },
    );
  });
});
