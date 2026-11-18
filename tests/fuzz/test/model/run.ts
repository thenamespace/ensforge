import { Effect, Formatter, Record as Rec } from "effect";

import { Chain } from "@ensforge/test-devnet";
import { mintUsdc } from "@ensforge/test-integration/support/contracts";

import { specOf, type Command } from "../commands/index.ts";
import { invariants } from "../invariants/index.ts";
import { SequenceFailure, type Context } from "./command.ts";
import type { Model } from "./model.ts";
import { initialModel } from "./sync.ts";

const atStep = (step: number, command: Command) => (failure: SequenceFailure) =>
  SequenceFailure.make({
    message: `step ${step} (${Formatter.formatJson(command)}): ${failure.message}`,
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
  const chain = yield* Chain;
  // Registrations pay in the payment token.
  yield* Effect.forEach(Rec.values(context.world.actors), (actor) => mintUsdc(actor, 10n ** 18n), {
    concurrency: 1,
    discard: true,
  }).pipe(Effect.orDie);
  let model = from ?? (yield* initialModel(context.world));

  for (const [step, command] of commands.entries()) {
    const next = yield* specOf(command)
      .run(context, model, command)
      .pipe(Effect.mapError(atStep(step, command)));
    model = { ...next, now: yield* Effect.orDie(chain.now) };
    yield* invariants(context, model, step, command).pipe(Effect.mapError(atStep(step, command)));
  }
  return model;
});

/** Runs `commands` with {@link applySequence} from the profile's state, then reverts the chain. */
export const runSequence = Effect.fnUntraced(function* (
  context: Context,
  commands: readonly Command[],
) {
  const chain = yield* Chain;
  // A failed snapshot is the devnet's fault, not a finding to shrink.
  yield* chain
    .isolated(applySequence(context, commands))
    .pipe(Effect.catchTag("ChainError", (error) => Effect.die(error)));
});
