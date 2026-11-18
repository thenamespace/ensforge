import { describe } from "@effect/vitest";
import { Effect, String as Str, pipe } from "effect";

import { onProfile } from "@ensforge/test-integration/support/lane";

import { makeContext } from "../model/command.ts";
import { load } from "../model/corpus.ts";
import { runSequence } from "../model/run.ts";
import { makeWorld } from "../model/world.ts";

// Every sequence a fuzz run once shrank to, replayed as a regression test.
describe("corpus", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    for (const [file, entry] of load()) {
      it.effect(`${file}: ${pipe(entry.failure, Str.split("\n"))[0]}`, () =>
        Effect.gen(function* () {
          const world = yield* makeWorld;
          const context = yield* makeContext(world);
          yield* runSequence(context, entry.commands);
        }),
      );
    }
  });
});
