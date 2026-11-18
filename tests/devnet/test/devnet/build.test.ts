// Digests the state file in memory; Effect has no hashing API.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { createHash } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";

import { Anvil } from "../../src/anvil/Anvil.ts";
import { build } from "../../src/build.ts";

describe("builds", () => {
  layer(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)))("devnet", (it) => {
    it.effect(
      "give the same chain state every time",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const digest = Effect.fnUntraced(function* () {
            const built = yield* build("mainnet-shaped", { force: true });
            const state = yield* fs.readFileString(built.stateFile);
            return createHash("sha256").update(state).digest("hex");
          });
          const first = yield* digest();
          const second = yield* digest();
          assert.strictEqual(first, second);
        }),
      { timeout: 120_000 },
    );
  });
});
