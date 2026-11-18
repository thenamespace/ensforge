import { assert, describe } from "@effect/vitest";
import { Array as Arr, Arbitrary, Effect, Order, pipe, Record as Rec, String as Str } from "effect";

import { onProfile } from "@ensforge/test-integration/support/lane";

import { Command } from "../commands/index.ts";
import { makeContext } from "../model/command.ts";
import { save } from "../model/corpus.ts";
import { runSequence } from "../model/run.ts";
import { makeWorld } from "../model/world.ts";
import { maxLength, runs, seed } from "./budget.ts";

describe("random sequences", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(`agree with the model and keep every invariant (seed ${seed})`, () =>
      Effect.gen(function* () {
        const world = yield* makeWorld;
        const context = yield* makeContext(world);
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.array(Arbitrary.schema(Command), { minLength: 1, maxLength }),
          (commands) => Effect.as(runSequence(context, commands), true),
          { seed, runs, size: maxLength, maxShrinks: 200 },
        );

        yield* Effect.logInfo(
          "outcomes",
          Rec.fromEntries(
            Arr.sort(
              [...context.outcomes],
              Order.make<readonly [string, unknown]>(([a], [b]) => pipe(a, Str.localeCompare(b))),
            ),
          ),
        );
        if (result._tag === "Falsified") {
          const failure =
            result.failure._tag === "PropertyError"
              ? result.failure.error.message
              : "returned false";
          const file = save({ seed, failure, commands: result.shrunkInput });
          assert.fail(
            `${failure}\nShrunk to ${result.shrunkInput.length} commands: corpus/${file}`,
          );
        }
        assert.strictEqual(result._tag, "Passed", Arbitrary.formatCheckFailure(result));
      }),
    );
  });
});
