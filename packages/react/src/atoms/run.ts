// Actions are type-erased here; their value and error types are restored from `action`.
/* oxlint-disable typescript/no-unsafe-type-assertion, effecttsgo/unsafe-effect-type-assertion, effecttsgo/any-unknown-in-error-context */
import { Effect, Predicate } from "effect";

import type { Ensforge } from "@ensforge/sdk";

import type { Action, ActionError, ActionValue } from "./types.js";

/**
 * Runs an action as an Effect. Effect actions run as they are; Promise actions get an abort
 * signal, so interrupting the fiber (a refresh, or the read leaving the cache after its idle TTL)
 * cancels their requests.
 */
export const runAction = <action extends Action>(
  action: action,
  client: Ensforge.Client,
  options: unknown,
): Effect.Effect<ActionValue<action>, ActionError<action>> =>
  Effect.suspend(() => {
    const controller = new AbortController();
    const run = action as unknown as (client: Ensforge.Client, options: unknown) => unknown;
    const output = run(client, {
      ...(Predicate.isObject(options) ? options : {}),
      signal: controller.signal,
    });

    const effect = Effect.isEffect(output)
      ? (output as Effect.Effect<ActionValue<action>, ActionError<action>>)
      : Effect.tryPromise({
          try: () => output as Promise<ActionValue<action>>,
          catch: (cause) => cause as ActionError<action>,
        });
    return effect.pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())));
  });
