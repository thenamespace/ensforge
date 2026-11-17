import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { call, ensforge, onProfile } from "../support/chain.ts";

describe("event.get", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect("returns a name's history in chain order, filtered by type", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("v1.unwrapped").name;

        const events = yield* call(() => ens.event.get({ name, fromBlock: 0n }));
        const order = events.map((event) => [event.blockNumber, event.logIndex] as const);
        assert.deepStrictEqual(
          order,
          order.toSorted(([a, i], [b, j]) => (a === b ? i - j : a < b ? -1 : 1)),
        );
        assert.includeMembers(
          events.map((event) => event.type),
          ["registration", "transfer", "resolver"],
        );

        const resolvers = yield* call(() =>
          ens.event.get({ name, fromBlock: 0n, types: ["resolver"] }),
        );
        assert.isAbove(resolvers.length, 0);
        assert.isTrue(resolvers.every((event) => event.type === "resolver"));
      }),
    );
  });
});
