import { Effect } from "effect";

import type { Ensforge } from "@ensforge/sdk";

import type { Action, ActionError, ActionValue } from "./types.js";

/**
 * Runs an action as an Effect. Effect actions run as they are; Promise actions get an abort
 * signal, so interrupting the fiber (unmount, refresh, key change) cancels their requests.
 */
export const runAction = <action extends Action>(
  action: action,
  client: Ensforge.Client,
  options: unknown,
): Effect.Effect<ActionValue<action>, ActionError<action>> =>
  Effect.suspend(() => {
    const controller = new AbortController();
    const run = action as unknown as (client: Ensforge.Client, options: unknown) => unknown;
    const output = run(client, { ...(options as object), signal: controller.signal });

    const effect = Effect.isEffect(output)
      ? (output as Effect.Effect<ActionValue<action>, ActionError<action>>)
      : Effect.tryPromise({
          try: () => output as Promise<ActionValue<action>>,
          catch: (cause) => cause as ActionError<action>,
        });
    return effect.pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())));
  });
