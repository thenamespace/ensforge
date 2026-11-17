import { createHash } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";

import { Anvil } from "../../src/anvil/Anvil.ts";
import { build } from "../../src/build.ts";

describe("builds", () => {
  it.effect(
    "give the same chain state every time",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const digest = Effect.fnUntraced(function* () {
          const built = yield* build("mainnet-shaped", { force: true });
          return createHash("sha256")
            .update(yield* fs.readFileString(built.stateFile))
            .digest("hex");
        });
        assert.strictEqual(yield* digest(), yield* digest());
      }).pipe(Effect.provide(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)))),
    { timeout: 120_000 },
  );
});
