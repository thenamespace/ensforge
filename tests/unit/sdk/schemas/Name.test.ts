import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import * as Name from "@ensforge/sdk/internal/schemas/Name";
import { Arbitraries } from "@ensforge/test-harness";

describe("Name.Normalized", () => {
  it.effect.each(["", "eth", "nick.eth", "名字.eth", `[${"ab".repeat(32)}].eth`])(
    "accepts %j",
    (input) =>
      Effect.gen(function* () {
        assert.strictEqual(yield* Schema.decodeEffect(Name.Normalized)(input), input);
      }),
  );

  it.effect.each([
    ["Nick.eth", "Expected an ENSIP-15 normalized ENS name"],
    ["ＮＩＣＫ.eth", "Expected an ENSIP-15 normalized ENS name"],
    ["nick..eth", "Expected a valid ENS name"],
    ["nick.eth.", "Expected a valid ENS name"],
  ] as const)("rejects %j", ([input, message]) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeEffect(Name.Normalized)(input));

      assert.include(error.message, message);
    }),
  );

  it.prop("accepts generated normalized names", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Schema.decodeSync(Name.Normalized)(name), name);
  });
});
