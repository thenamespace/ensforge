import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema, String as Str } from "effect";

import * as Name from "@ensforge/sdk/internal/schemas/Name";
import { Arbitraries } from "@ensforge/test-harness";

describe("Name.Normalized", () => {
  it.effect.each(["", "eth", "nick.eth", "名字.eth", `[${Str.repeat(32)("ab")}].eth`])(
    "accepts %j",
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeEffect(Name.Normalized)(input);

        assert.strictEqual(decoded, input);
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

  it.effect.prop("accepts generated normalized names", [Arbitraries.name], ([name]) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeEffect(Name.Normalized)(name);

      assert.strictEqual(decoded, name);
    }),
  );
});
