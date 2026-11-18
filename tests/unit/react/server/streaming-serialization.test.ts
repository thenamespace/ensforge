// @vitest-environment node
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Predicate, Schema } from "effect";
import { AtomRegistry, Hydration } from "effect/reactivity";

import { dehydrate, prefetch } from "@ensforge/react/server";

import { client, fakeRead } from "../fixtures.js";

// `dehydrate(registry, { streaming: true })` sends reads still loading as `resultPromise`, a real
// Promise. Loaders hand it to a framework's serializer: TanStack Start's is seroval, which streams
// promises (checked against seroval 1.8 `crossSerializeStream`: the promise becomes a resolver and a
// later chunk carries the settled value). React Router's is turbo-stream, which also streams
// promises returned from a loader. Neither is a dependency of this repository, so this test pins
// what they rely on: which fields are promises, and what the promise resolves to.

const profile = { name: "nick.eth", expiry: 1_700_000_000n, hash: new Uint8Array([1, 2, 255]) };

describe("streamed dehydration", () => {
  it.effect("holds one promise per read still loading and nothing else that is not JSON", () =>
    Effect.gen(function* () {
      let settle = (_value: typeof profile): void => undefined;
      const loading = fakeRead(
        "name.get",
        // oxlint-disable-next-line effecttsgo/new-promise -- a read the test settles by hand
        (_options: { name: string }) => new Promise<typeof profile>((done) => (settle = done)),
      );
      const settled = fakeRead("name.get", (_options: { name: string }) => profile);
      const server = AtomRegistry.make();
      void prefetch(server, client(), loading.action, { name: "loading.eth" });
      yield* Effect.promise(() =>
        prefetch(server, client(), settled.action, { name: "settled.eth" }),
      );

      const state = Hydration.toValues(dehydrate(server, { streaming: true }));
      const pending = Arr.filter(state, (entry) => entry.resultPromise !== undefined);
      const done = Arr.filter(state, (entry) => entry.resultPromise === undefined);

      assert.strictEqual(pending.length, 1);
      assert.strictEqual(done.length, 1);
      assert.isTrue(pending[0]?.resultPromise instanceof Promise);
      // A settled entry has no `resultPromise` key at all, not `undefined`.
      assert.notProperty(done[0] ?? {}, "resultPromise");

      // Without `streaming`, reads still loading are left out: no promises are sent.
      const plain = Hydration.toValues(dehydrate(server));
      assert.isTrue(Arr.every(plain, (entry) => !("resultPromise" in entry)));

      // The promise settles to JSON (bigints and bytes tagged), which any serializer can send.
      settle(profile);
      const value = yield* Effect.promise(() => Promise.resolve(pending[0]?.resultPromise));
      const json = Schema.fromJsonString(Schema.Unknown);
      const wire = yield* Schema.encodeEffect(json)(value);
      const decoded = yield* Schema.decodeEffect(json)(wire);
      assert.deepStrictEqual(decoded, value);
      assert.isTrue(Predicate.isObject(value));
    }),
  );

  it.effect(
    "cannot go through JSON or structured clone, which need a promise-aware serializer",
    () =>
      Effect.gen(function* () {
        const loading = fakeRead(
          "name.get",
          // oxlint-disable-next-line effecttsgo/new-promise -- a read that never settles
          (_options: { name: string }) => new Promise<typeof profile>(() => undefined),
        );
        const server = AtomRegistry.make();
        void prefetch(server, client(), loading.action, { name: "loading.eth" });
        const state = dehydrate(server, { streaming: true });

        // JSON silently turns the promise into `{}`, which the browser would never settle.
        const json = Schema.fromJsonString(Schema.Unknown);
        const wire = yield* Schema.encodeEffect(json)(state);
        const [roundTripped] = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ resultPromise: Schema.Unknown }))),
        )(wire);
        assert.deepStrictEqual(roundTripped?.resultPromise, {});

        assert.throws(() => structuredClone(state), "could not be cloned");
      }),
  );
});
