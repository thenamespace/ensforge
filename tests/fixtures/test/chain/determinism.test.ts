import { createHash } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";

import { Anvil, build } from "@ensforge/test-devnet";

import { fixtureSeed, sourcesKey } from "../../src/seed.ts";

describe("seeding", () => {
  it.effect(
    "gives the same chain state and manifest every time",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const seed = fixtureSeed("mainnet-shaped", yield* sourcesKey());
        const digest = Effect.fnUntraced(function* () {
          const built = yield* build("mainnet-shaped", { force: true, seed });
          const state = createHash("sha256").update(yield* fs.readFileString(built.stateFile));
          return { state: state.digest("hex"), manifest: JSON.stringify(built.seed) };
        });
        assert.deepStrictEqual(yield* digest(), yield* digest());
      }).pipe(Effect.provide(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)))),
    { timeout: 300_000 },
  );
});
