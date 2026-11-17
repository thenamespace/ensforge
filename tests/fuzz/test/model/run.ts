import { Effect } from "effect";

import { isolated } from "@ensforge/test-integration/support/chain";

import { specOf, type Command } from "../commands/index.ts";
import { invariants } from "../invariants/index.ts";
import { SequenceFailure, type Context } from "./command.ts";
import type { Model } from "./model.ts";
import { initialModel } from "./sync.ts";
import { chainTime, fund } from "./world.ts";

const atStep = (step: number, command: Command) => (failure: SequenceFailure) =>
  new SequenceFailure({
    message: `step ${step} (${JSON.stringify(command)}): ${failure.message}`,
  });

/**
 * Runs `commands`, checking each against the model's prediction and every invariant on the new
 * state, and returns the final model. It starts from the profile's state unless given the model a
 * previous sequence left, and leaves the chain changed; see {@link runSequence}.
 */
export const applySequence = Effect.fnUntraced(function* (
  context: Context,
  commands: readonly Command[],
  from?: Model,
) {
  yield* fund(context.world);
  let model = from ?? (yield* initialModel(context.world));

  for (const [step, command] of commands.entries()) {
    const next = yield* specOf(command)
      .run(context, model, command)
      .pipe(Effect.mapError(atStep(step, command)));
    model = { ...next, now: yield* chainTime(context.world) };
    yield* invariants(context, model, step, command).pipe(Effect.mapError(atStep(step, command)));
  }
  return model;
});

/** Runs `commands` with {@link applySequence} from the profile's state, then reverts the chain. */
export const runSequence = (context: Context, commands: readonly Command[]) =>
  isolated(context.world.devnet, Effect.asVoid(applySequence(context, commands)));
