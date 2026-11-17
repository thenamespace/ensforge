import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Fixtures } from "@ensforge/test-fixtures";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("event.get", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect("returns a name's history in chain order, filtered by type", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const name = fixtures.byId("v1.unwrapped").name;

        const events = yield* Actions.event.get(reader, { name, fromBlock: 0n });
        const order = events.map((event) => [event.blockNumber, event.logIndex] as const);
        assert.deepStrictEqual(
          order,
          order.toSorted(([a, i], [b, j]) => (a === b ? i - j : a < b ? -1 : 1)),
        );
        assert.includeMembers(
          events.map((event) => event.type),
          ["registration", "transfer", "resolver"],
        );

        const resolvers = yield* Actions.event.get(reader, {
          name,
          fromBlock: 0n,
          types: ["resolver"],
        });
        assert.isAbove(resolvers.length, 0);
        assert.isTrue(resolvers.every((event) => event.type === "resolver"));
      }),
    );
  });
});
