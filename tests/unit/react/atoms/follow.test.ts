import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AtomRegistry } from "effect/reactivity";

import { ensAtom, ensPagesAtom, ensWriteAtom, invalidate } from "@ensforge/react/atoms";
import type { Ensforge, Plan, Write } from "@ensforge/sdk";

import { client, fakeRead } from "../fixtures.js";

const alice = "0x00000000000000000000000000000000000a11ce";

// Reads also refresh for the names and accounts their values hold, not only their options.
describe("reads follow the subjects of their values", () => {
  // The write invalidates its reads on a later macrotask: `it.live` lets `Effect.sleep` wait.
  it.live("refetches a primary name when a write touches that name", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action: read, calls } = fakeRead(
        "primaryName.get",
        (_options: { address: string }) => "alice.eth",
      );
      const write = Object.assign(
        (_client: Ensforge.Client, _options: { name: string }): Promise<Write.Result> =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the atoms never read the plan
          Promise.resolve({ hash: "0x", hashes: [], id: undefined, plan: {} as Plan }),
        { path: "record.set" },
      );
      const registry = AtomRegistry.make();
      const atom = ensAtom(ens, read, { address: alice });
      registry.mount(atom);
      yield* AtomRegistry.getResult(registry, atom);
      const atoms = ensWriteAtom(ens, write);
      registry.mount(atoms.run);

      registry.set(atoms.run, { name: "alice.eth" });
      yield* AtomRegistry.getResult(registry, atoms.run);
      yield* Effect.sleep(1);

      assert.strictEqual(calls.length, 2);
    }),
  );

  it.effect("refetches an account's names when one of them changes, whoever is named", () =>
    Effect.gen(function* () {
      const ens = client();
      const { action, calls } = fakeRead(
        "indexer.getNamesForAddress",
        (_options: { address: string; cursor?: string }) => ({
          items: [{ name: "alice.eth" }],
          cursor: null,
          hasMore: false,
        }),
      );
      const registry = AtomRegistry.make();
      const names = ensPagesAtom(ens, action, { address: alice });
      registry.mount(names);
      yield* AtomRegistry.getResult(registry, names);

      // An operator moved alice.eth away: the write named the name and the new owner only.
      invalidate(registry, ens, { names: ["alice.eth"] });
      yield* AtomRegistry.getResult(registry, names, { suspendOnWaiting: true });

      assert.strictEqual(calls.length, 2);
    }),
  );
});
