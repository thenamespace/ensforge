import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";

import { ensAtom, invalidate, type Freshness } from "@ensforge/react/atoms";
import type { Ensforge } from "@ensforge/sdk";

import { client, fakeEffectRead, fakeRead } from "../fixtures.js";

describe("ensAtom", () => {
  it.effect(
    "is one atom, and one request, per client's chain and account, action and options",
    () =>
      Effect.gen(function* () {
        const ens = client();
        const { action, calls } = fakeRead("test.get", (options: { name: string }) => options.name);
        const registry = AtomRegistry.make();

        const first = ensAtom(ens, action, { name: "Nick.eth" });
        assert.strictEqual(
          first,
          ensAtom(ens, action, { name: "nick.eth", blockTag: undefined } as { name: string }),
        );
        assert.strictEqual(first, ensAtom(client(), action, { name: "nick.eth" }));

        registry.mount(first);
        registry.mount(ensAtom(client(), action, { name: "nick.eth" }));
        yield* AtomRegistry.getResult(registry, first);

        assert.strictEqual(calls.length, 1);
      }),
  );

  // Regression: a client of another account on the same chain got the first account's answer.
  it.effect("keeps the reads of clients of other accounts apart", () =>
    Effect.gen(function* () {
      const alice = client({ account: "0x00000000000000000000000000000000000a11ce" });
      const bob = client({ account: "0x0000000000000000000000000000000000000b0b" });
      const action = Object.assign(
        async (ens: Ensforge.Client, _options: { name: string }) => ens.account,
        { path: "test.account" },
      );
      const registry = AtomRegistry.make();
      const aliceRead = ensAtom(alice, action, { name: "a.eth" });
      const bobRead = ensAtom(bob, action, { name: "a.eth" });

      registry.mount(aliceRead);
      registry.mount(bobRead);

      assert.strictEqual(yield* AtomRegistry.getResult(registry, aliceRead), alice.account);
      assert.strictEqual(yield* AtomRegistry.getResult(registry, bobRead), bob.account);
    }),
  );

  // Regression: a `Duration` serialized through its `toJSON`, so the read kept no freshness;
  // later, field order and bigints (nanoseconds) made equal settings distinct or threw.
  it("reads equal freshness in any form or field order as one atom", () => {
    const ens = client();
    const { action } = fakeRead("test.fresh", (options: { name: string }) => options.name);
    const read = (freshness: Freshness) => ensAtom(ens, action, { name: "a.eth" }, freshness);

    assert.strictEqual(read({ staleTime: Duration.seconds(30) }), read({ staleTime: 30_000 }));
    assert.strictEqual(read({ staleTime: 1_000_000_000n }), read({ staleTime: "1 second" }));
    assert.strictEqual(
      read({ staleTime: 5000, idleTTL: 1000 }),
      read({ idleTTL: 1000, staleTime: 5000 }),
    );
    assert.strictEqual(read({ idleTTL: Duration.infinity }), read({ idleTTL: "forever" }));
  });

  // Regression: the first hook's freshness applied to every hook of a read.
  it.live("polls for a hook that asks to, beside one that does not", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action, calls } = fakeRead("test.poll", (options: { name: string }) => options.name);
      const registry = AtomRegistry.make();
      const plain = ensAtom(ens, action, { name: "a.eth" });
      registry.mount(plain);
      yield* AtomRegistry.getResult(registry, plain);

      registry.mount(ensAtom(ens, action, { name: "a.eth" }, { refetchInterval: 10 }));
      yield* Effect.sleep(100);

      assert.isAtLeast(calls.length, 3);
    }),
  );

  // Regression: refreshing through a hook whose freshness differed from the first did nothing.
  it.live("refetches the read when refreshed through any hook's atom", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action, calls } = fakeRead(
        "test.refresh",
        (options: { name: string }) => options.name,
      );
      const registry = AtomRegistry.make();
      const first = ensAtom(ens, action, { name: "a.eth" }, { staleTime: 5000 });
      const second = ensAtom(ens, action, { name: "a.eth" }, { idleTTL: "10 minutes" });
      registry.mount(first);
      registry.mount(second);
      yield* AtomRegistry.getResult(registry, first);

      registry.refresh(second);
      yield* AtomRegistry.getResult(registry, first, { suspendOnWaiting: true });

      assert.strictEqual(calls.length, 2);
    }),
  );

  // Regression: `Duration.infinity` reached `setTimeout` (polling without pause) or threw.
  it.live("reads `Duration.infinity` as never refetch and never evict", () =>
    Effect.gen(function* () {
      const { action, calls } = fakeRead(
        "test.infinity",
        (options: { name: string }) => options.name,
      );
      const registry = AtomRegistry.make({ timeoutResolution: 5 });
      const forever = ensAtom(
        client(),
        action,
        { name: "a.eth" },
        {
          staleTime: Duration.infinity,
          refetchInterval: Duration.infinity,
          idleTTL: Duration.infinity,
        },
      );
      const brief = ensAtom(client(), action, { name: "b.eth" }, { idleTTL: 10 });
      const unmountForever = registry.mount(forever);
      const unmountBrief = registry.mount(brief);
      yield* AtomRegistry.getResult(registry, forever);
      yield* AtomRegistry.getResult(registry, brief);
      yield* Effect.sleep(30);

      unmountForever();
      unmountBrief();
      yield* Effect.sleep(50);
      registry.mount(forever);
      registry.mount(brief);
      yield* Effect.sleep(10);

      assert.deepStrictEqual(
        calls.map((call) => call.options.name),
        ["a.eth", "b.eth", "b.eth"],
      );
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

describe("failed reads", () => {
  // Regression: a failure stayed cached for the idle TTL, so remounting showed the same error.
  it.live("are retried when the read mounts again", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const { action, calls } = fakeRead("test.flaky", (_options: { name: string }) =>
        attempts++ === 0 ? Promise.reject(new Error("blip")) : "ok",
      );
      const registry = AtomRegistry.make();
      const atom = ensAtom(client(), action, { name: "a.eth" });
      const unmount = registry.mount(atom);
      yield* Effect.flip(AtomRegistry.getResult(registry, atom));
      unmount();
      yield* Effect.sleep(5);

      registry.mount(atom);
      const value = yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });

      assert.strictEqual(value, "ok");
      assert.strictEqual(calls.length, 2);
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
