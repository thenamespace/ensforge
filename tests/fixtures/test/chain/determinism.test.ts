// Digests the state file in memory; Effect has no hashing API.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { createHash } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, FileSystem, Formatter, Layer } from "effect";

import { Anvil, build } from "@ensforge/test-devnet";

import { fixtureSeed, sourcesKey } from "../../src/seed.ts";

describe("seeding", () => {
  layer(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)))("devnet", (it) => {
    it.effect(
      "gives the same chain state and manifest every time",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const key = yield* sourcesKey();
          const seed = fixtureSeed("mainnet-shaped", key);
          const digest = Effect.fnUntraced(function* () {
            const built = yield* build("mainnet-shaped", { force: true, seed });
            const stateFile = yield* fs.readFileString(built.stateFile);
            const state = createHash("sha256").update(stateFile).digest("hex");
            return { state, manifest: Formatter.formatJson(built.seed) };
          });
          const first = yield* digest();
          const second = yield* digest();
          assert.deepStrictEqual(first, second);
        }),
      { timeout: 300_000 },
    );
  });
});
