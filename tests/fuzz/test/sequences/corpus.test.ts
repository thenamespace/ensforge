import { describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { onProfile } from "@ensforge/test-integration/support/chain";

import { makeContext } from "../model/command.ts";
import { load } from "../model/corpus.ts";
import { runSequence } from "../model/run.ts";
import { makeWorld } from "../model/world.ts";

// Every sequence a fuzz run once shrank to, replayed as a regression test.
describe("corpus", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    for (const [file, entry] of load()) {
      it.effect(`${file}: ${entry.failure.split("\n")[0]}`, () =>
        Effect.gen(function* () {
          const context = makeContext(yield* makeWorld(yield* Devnet, yield* Fixtures));
          yield* runSequence(context, entry.commands);
        }),
      );
    }
  });
});
