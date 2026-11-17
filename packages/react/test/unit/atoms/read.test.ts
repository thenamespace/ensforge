import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";

import { ensAtom, invalidate } from "#/atoms/index";

import { client, fakeEffectRead, fakeRead, tick } from "../../fixtures.js";

const settled = <value, error>(
  registry: AtomRegistry.AtomRegistry,
  atom: Parameters<typeof AtomRegistry.getResult<value, error>>[1],
) => Effect.runPromise(Effect.exit(AtomRegistry.getResult(registry, atom)));

describe("ensAtom", () => {
  it("is one atom, and one request, per client, action and options", async () => {
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
    await settled(registry, first);

    assert.strictEqual(calls.length, 1);
  });

  it("runs Effect actions and keeps their typed failures", async () => {
    const action = fakeEffectRead("test.fail", (_options: { name: string }) =>
      Effect.fail({ _tag: "Nope" as const }),
    );
    const registry = AtomRegistry.make();
    const atom = ensAtom(client(), action, { name: "a.eth" });

    registry.mount(atom);
    await settled(registry, atom);
    const result = registry.get(atom);

    assert.isTrue(AsyncResult.isFailure(result));
    assert.deepStrictEqual(
      AsyncResult.error(result).pipe((option) => option._tag === "Some" && option.value),
      { _tag: "Nope" },
    );
  });

  it("aborts a Promise action's request when the read is refreshed", async () => {
    const { action, calls } = fakeRead(
      "test.slow",
      (_options: { name: string }) => new Promise<never>(() => undefined),
    );
    const registry = AtomRegistry.make();
    const atom = ensAtom(client(), action, { name: "a.eth" });

    registry.mount(atom);
    await tick();
    registry.refresh(atom);
    await tick();

    assert.strictEqual(calls.length, 2);
    assert.isTrue(calls[0]?.signal?.aborted);
    assert.isFalse(calls[1]?.signal?.aborted);
  });
});

describe("invalidate", () => {
  it("refetches the reads of the given names, and only those", async () => {
    const ens = client();
    const { action, calls } = fakeRead("test.get", (options: { name: string }) => options.name);
    const registry = AtomRegistry.make();
    const alice = ensAtom(ens, action, { name: "alice.eth" });
    const bob = ensAtom(ens, action, { name: "bob.eth" });
    registry.mount(alice);
    registry.mount(bob);
    await settled(registry, alice);
    await settled(registry, bob);

    invalidate(registry, ens, { names: ["Alice.eth"] });
    await tick();

    assert.deepStrictEqual(
      calls.map((call) => call.options.name),
      ["alice.eth", "bob.eth", "alice.eth"],
    );
  });
});
