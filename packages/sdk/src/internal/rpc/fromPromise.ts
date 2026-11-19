import { Effect } from "effect";

import type { EnsforgeError } from "../../errors/EnsforgeError.js";
import type { AnyError } from "../../errors/types.js";
import { failWith, Untranslated } from "../anyError.js";

/**
 * Runs a viem call as an Effect whose failures are already ensforge errors.
 *
 * @stability unstable
 */
export const fromPromise = <value>(
  evaluate: (signal: AbortSignal) => Promise<value>,
  context?: EnsforgeError.Context,
): Effect.Effect<value, AnyError> =>
  Effect.tryPromise({ try: evaluate, catch: (cause) => new Untranslated({ cause }) }).pipe(
    Effect.catchTag("Untranslated", ({ cause }) => failWith(cause, context)),
  );
