import { assert, describe } from "@effect/vitest";
import { Array as Arr, Effect, Order } from "effect";

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
        const order = Arr.map(events, (event) => [event.blockNumber, event.logIndex] as const);
        assert.deepStrictEqual(order, Arr.sort(order, Order.Tuple([Order.BigInt, Order.Number])));
        assert.includeMembers(
          Arr.map(events, (event) => event.type),
          ["registration", "transfer", "resolver"],
        );

        const resolvers = yield* Actions.event.get(reader, {
          name,
          fromBlock: 0n,
          types: ["resolver"],
        });
        assert.isAbove(resolvers.length, 0);
        assert.isTrue(Arr.every(resolvers, (event) => event.type === "resolver"));
      }),
    );
  });
});
