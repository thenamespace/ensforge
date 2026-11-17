import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { atTimestamp, call, ensforge, onProfile } from "../support/chain.ts";

const days = (count: bigint) => count * 86_400n;

/** `name.get` at each offset from `expiry`, reduced to the fields that change with time. */
const timeline = (fixtureId: string, offsets: readonly bigint[]) =>
  Effect.gen(function* () {
    const fixtures = yield* Fixtures;
    const devnet = yield* Devnet;
    const fixture = fixtures.byId(fixtureId);
    const expiry = BigInt(String(fixture.facts["expiry"]));
    const ens = ensforge(devnet);

    return yield* Effect.forEach(offsets, (offset) =>
      atTimestamp(
        devnet,
        expiry + offset,
        call(() => ens.name.get({ name: fixture.name })).pipe(
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

const registered = {
  status: "registered",
  owner: "owner",
  available: false,
  renewable: true,
} as const;

describe("name.get over time", () => {
  // Before the launch ENSv1 registers and renews: BaseRegistrar's grace includes its last second.
  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "an ENSv1 .eth name expires at its expiry and is released one second after grace",
      () =>
        Effect.gen(function* () {
          const grace = days(90n);
          const states = yield* timeline("v1.unwrapped", [-1n, 0n, grace - 1n, grace, grace + 1n]);

          // The registrar token has no owner from its expiry on.
          const inGrace = {
            status: "grace",
            owner: null,
            available: false,
            renewable: true,
          } as const;
          assert.deepStrictEqual(states, [
            registered,
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
          const grace = days(90n);
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
          const grace = days(28n);
          const states = yield* timeline("v2.registered", [-1n, 0n, grace - 1n, grace]);

          const inGrace = {
            status: "grace",
            owner: null,
            available: false,
            renewable: true,
          } as const;
          assert.deepStrictEqual(states, [
            registered,
            inGrace,
            inGrace,
            { status: "expired", owner: null, available: true, renewable: false },
          ]);
        }),
      { meta: { cases: ["T04", "T05", "M:E1", "M:E2", "M:E3"] } },
    );
  });
});
