import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Clock, Effect, Option, Predicate, String as Str } from "effect";
import { AtomRegistry, Hydration } from "effect/reactivity";

import { ensAtom } from "@ensforge/react/atoms";
import { dehydrate, prefetch } from "@ensforge/react/server";

import { client, fakeRead } from "../fixtures.js";

// Runs in jsdom: the registry that hydrates is the browser's.
describe("hydrated reads", () => {
  // Regression: without a `staleTime`, a hydrated value was never fetched again while cached.
  it.live("revalidate on mount once older than 30 seconds, and are kept before", () =>
    Effect.gen(function* () {
      const { action, calls } = fakeRead("name.get", (options: { name: string }) => options.name);
      const server = AtomRegistry.make();
      yield* Effect.promise(() => prefetch(server, client(), action, { name: "old.eth" }));
      yield* Effect.promise(() => prefetch(server, client(), action, { name: "new.eth" }));
      const state = Hydration.toValues(dehydrate(server));
      const old = Option.getOrUndefined(
        Arr.findFirst(state, (entry) => Str.includes("old.eth")(entry.key)),
      )?.value;
      if (!Predicate.isObject(old)) assert.fail("the old.eth read was not dehydrated");
      const currentTime = yield* Clock.currentTimeMillis;
      Object.assign(old, { timestamp: currentTime - 31_000 });
      calls.length = 0;

      const browser = AtomRegistry.make();
      Hydration.hydrate(browser, state);
      browser.mount(ensAtom(client(), action, { name: "old.eth" }));
      browser.mount(ensAtom(client(), action, { name: "new.eth" }));
      yield* Effect.sleep(10);

      assert.deepStrictEqual(
        Arr.map(calls, (call) => call.options.name),
        ["old.eth"],
      );
    }),
  );
});
