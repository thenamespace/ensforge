import { assert, describe } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { onProfile } from "@ensforge/test-integration/support/chain";

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
        const context = makeContext(yield* makeWorld(yield* Devnet, yield* Fixtures));
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.array(Arbitrary.schema(Command), { minLength: 1, maxLength }),
          (commands) => Effect.as(runSequence(context, commands), true),
          { seed, runs, size: maxLength, maxShrinks: 40 },
        );

        yield* Effect.logInfo(
          "outcomes",
          Object.fromEntries([...context.outcomes].toSorted(([a], [b]) => a.localeCompare(b))),
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
