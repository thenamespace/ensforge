import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";

import { ensAtom, invalidate } from "@ensforge/react/atoms";

import { client, fakeEffectRead, fakeRead } from "../fixtures.js";

describe("ensAtom", () => {
  it.effect("is one atom, and one request, per client, action and options", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action, calls } = fakeRead("test.get", (options: { name: string }) => options.name);
      const registry = AtomRegistry.make();

      const first = ensAtom(ens, action, { name: "Nick.eth" });
      assert.strictEqual(
        first,
        ensAtom(ens, action, { name: "nick.eth", blockTag: undefined } as { name: string }),
      );
      assert.notStrictEqual(first, ensAtom(client(), action, { name: "nick.eth" }));

      registry.mount(first);
      registry.mount(ensAtom(ens, action, { name: "nick.eth" }));
      yield* AtomRegistry.getResult(registry, first);

      assert.strictEqual(calls.length, 1);
    }),
  );

  it.effect("runs Effect actions and keeps their typed failures", () =>
    Effect.gen(function* () {
      const action = fakeEffectRead("test.fail", (_options: { name: string }) =>
        Effect.fail({ _tag: "Nope" as const }),
      );
      const registry = AtomRegistry.make();
      const atom = ensAtom(client(), action, { name: "a.eth" });

      registry.mount(atom);
      const error = yield* Effect.flip(AtomRegistry.getResult(registry, atom));

      assert.deepStrictEqual(error, { _tag: "Nope" });
      assert.isTrue(AsyncResult.isFailure(registry.get(atom)));
    }),
  );

  // The fake action is a Promise, so the abort lands on a later macrotask: `it.live` lets
  // `Effect.sleep` wait for it.
  it.live("aborts a Promise action's request when the read is refreshed", () =>
    Effect.gen(function* () {
      const { action, calls } = fakeRead(
        "test.slow",
        (_options: { name: string }) => new Promise<never>(() => undefined),
      );
      const registry = AtomRegistry.make();
      const atom = ensAtom(client(), action, { name: "a.eth" });

      registry.mount(atom);
      yield* Effect.sleep(1);
      registry.refresh(atom);
      yield* Effect.sleep(1);

      assert.strictEqual(calls.length, 2);
      assert.isTrue(calls[0]?.signal?.aborted);
      assert.isFalse(calls[1]?.signal?.aborted);
    }),
  );
});

describe("invalidate", () => {
  it.effect("refetches the reads of the given names, and only those", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action, calls } = fakeRead("test.get", (options: { name: string }) => options.name);
      const registry = AtomRegistry.make();
      const alice = ensAtom(ens, action, { name: "alice.eth" });
      const bob = ensAtom(ens, action, { name: "bob.eth" });
      registry.mount(alice);
      registry.mount(bob);
      yield* AtomRegistry.getResult(registry, alice);
      yield* AtomRegistry.getResult(registry, bob);

      invalidate(registry, ens, { names: ["Alice.eth"] });
      yield* AtomRegistry.getResult(registry, alice, { suspendOnWaiting: true });

      assert.deepStrictEqual(
        calls.map((call) => call.options.name),
        ["alice.eth", "bob.eth", "alice.eth"],
      );
    }),
  );
});
