import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { Arbitraries } from "@ensforge/test-harness";

import * as Name from "#/schemas/Name";

const decode = Schema.decodeUnknownEffect(Name.Normalized);

describe("Name.Normalized", () => {
  it.effect.each(["", "eth", "nick.eth", "名字.eth", `[${"ab".repeat(32)}].eth`])(
    "accepts %j",
    (input) =>
      Effect.gen(function* () {
        assert.strictEqual(yield* decode(input), input);
      }),
  );

  it.effect.each([
    ["Nick.eth", "Expected an ENSIP-15 normalized ENS name"],
    ["ＮＩＣＫ.eth", "Expected an ENSIP-15 normalized ENS name"],
    ["nick..eth", "Expected a valid ENS name"],
    ["nick.eth.", "Expected a valid ENS name"],
  ] as const)("rejects %j", ([input, message]) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decode(input));
      assert.include(error.message, message);
    }),
  );

  it.prop("accepts generated normalized names", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Schema.decodeSync(Name.Normalized)(name), name);
  });
});
