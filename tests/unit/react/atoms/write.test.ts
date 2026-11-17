import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";

import { ensAtom, ensWriteAtom } from "@ensforge/react/atoms";
import type { Ensforge, Plan, Write } from "@ensforge/sdk";

import { client, fakeRead } from "../fixtures.js";

const signer = "0x0000000000000000000000000000000000000b0b";

/** A fake write: reports two plan events and resolves without transactions to wait for. */
const fakeWrite = () => {
  const step = { id: "records", description: "Set records", calls: [] } as unknown as Plan.Step;
  const sent: unknown[] = [];
  const action = Object.assign(
    async (
      _client: Ensforge.Client,
      options: { readonly name: string; readonly onStep?: (event: Plan.Event) => void },
    ): Promise<Write.Result> => {
      sent.push(options.name);
      options.onStep?.({ step, status: "submitted", hashes: [] });
      options.onStep?.({ step, status: "confirmed", hashes: [] });
      return {
        hash: "0x",
        hashes: [],
        id: undefined,
        plan: { account: signer } as unknown as Plan,
      };
    },
    { path: "test.set" },
  );
  return { action, sent };
};

describe("ensWriteAtom", () => {
  it.effect("collects plan events in steps and passes them on to the caller's onStep", () =>
    Effect.gen(function* () {
      const { action } = fakeWrite();
      const registry = AtomRegistry.make();
      const write = ensWriteAtom(client(), action);
      const own: Plan.Event["status"][] = [];
      registry.mount(write.steps);
      registry.mount(write.run);

      registry.set(write.run, { name: "alice.eth", onStep: (event) => own.push(event.status) });
      yield* AtomRegistry.getResult(registry, write.run);

      assert.deepStrictEqual(
        registry.get(write.steps).map((event) => event.status),
        ["submitted", "confirmed"],
      );
      assert.deepStrictEqual(own, ["submitted", "confirmed"]);
      assert.isTrue(AsyncResult.isSuccess(registry.get(write.run)));
    }),
  );

  // The write invalidates its reads once it settles, on a later macrotask: `it.live` lets
  // `Effect.sleep` wait for it.
  it.live(
    "refetches chain reads of the names and signer it touched, not others or indexer reads",
    () =>
      Effect.gen(function* () {
        const ens = client();
        const { action: write } = fakeWrite();
        const { action: read, calls } = fakeRead(
          "record.get",
          (_options: { name?: string; address?: string }) => 1,
        );
        const { action: indexed, calls: indexedCalls } = fakeRead(
          "indexer.getName",
          (_options: { name: string }) => 1,
        );
        const registry = AtomRegistry.make();
        const reads = [
          ensAtom(ens, read, { name: "alice.eth" }),
          ensAtom(ens, read, { name: "bob.eth" }),
          ensAtom(ens, read, { address: signer }),
          ensAtom(ens, indexed, { name: "alice.eth" }),
        ];
        for (const atom of reads) registry.mount(atom);
        yield* Effect.forEach(reads, (atom) => AtomRegistry.getResult(registry, atom));
        const atoms = ensWriteAtom(ens, write);
        registry.mount(atoms.run);

        registry.set(atoms.run, { name: "alice.eth" });
        yield* AtomRegistry.getResult(registry, atoms.run);
        yield* Effect.sleep(1);

        assert.deepStrictEqual(
          calls.map(({ options }) => options.name ?? options.address),
          ["alice.eth", "bob.eth", signer, "alice.eth", signer],
        );
        assert.strictEqual(indexedCalls.length, 1);
      }),
  );
});
