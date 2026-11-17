import { Effect } from "effect";

import { isolated } from "@ensforge/test-integration/support/chain";

import { specOf, type Command } from "../commands/index.ts";
import { invariants } from "../invariants/index.ts";
import { SequenceFailure, type Context } from "./command.ts";
import { initialModel } from "./sync.ts";
import { chainTime, fund } from "./world.ts";

const atStep = (step: number, command: Command) => (failure: SequenceFailure) =>
  new SequenceFailure({
    message: `step ${step} (${JSON.stringify(command)}): ${failure.message}`,
  });

/**
 * Runs `commands` from the profile's state and reverts the chain afterwards. Each command is
 * checked against the model's prediction, then every invariant runs on the new state.
 */
export const runSequence = (context: Context, commands: readonly Command[]) =>
  isolated(
    context.world.devnet,
    Effect.gen(function* () {
      yield* fund(context.world);
      let model = yield* initialModel(context.world);

      for (const [step, command] of commands.entries()) {
        const next = yield* specOf(command)
          .run(context, model, command)
          .pipe(Effect.mapError(atStep(step, command)));
        model = { ...next, now: yield* chainTime(context.world) };
        yield* invariants(context, model, command).pipe(Effect.mapError(atStep(step, command)));
      }
    }),
  );
