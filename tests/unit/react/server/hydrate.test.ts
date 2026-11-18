import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
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
      const old = state.find((entry) => entry.key.includes("old.eth"))?.value;
      Object.assign(old as object, { timestamp: Date.now() - 31_000 });
      calls.length = 0;

      const browser = AtomRegistry.make();
      Hydration.hydrate(browser, state);
      browser.mount(ensAtom(client(), action, { name: "old.eth" }));
      browser.mount(ensAtom(client(), action, { name: "new.eth" }));
      yield* Effect.sleep(10);

      assert.deepStrictEqual(
        calls.map((call) => call.options.name),
        ["old.eth"],
      );
    }),
  );
});
