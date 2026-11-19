import { Data, Effect } from "effect";

import type { Hex } from "viem";

import type { EnsforgeError } from "../errors/EnsforgeError.js";
import { isEnsforgeError } from "../errors/guards.js";
import type { AnyError } from "../errors/types.js";

// Translating viem errors decodes reverts against every ENS contract error, which is a large share
// of an action's code; it loads on the first failure that needs it, not with the action.
const translation = () => import("../errors/translate/fromCause.js");

/**
 * A failure not yet translated into an ensforge error: what `catch` handlers hand to
 * {@link failWith} once the translation has loaded.
 *
 * @stability unstable
 */
// oxlint-disable-next-line effecttsgo/prefer-schema-tagged-error -- Schema is in no action's bundle; a schema here would add it to all of them
export class Untranslated extends Data.TaggedError("Untranslated")<{ readonly cause: unknown }> {}

/**
 * `Errors.fromCause` typed as the union of ensforge error classes, for an Effect's error channel.
 * ensforge errors are kept as the same instance, with `context` merged in.
 *
 * @stability unstable
 */
export const toAnyErrorAsync = (
  cause: unknown,
  context?: EnsforgeError.Context,
): Promise<AnyError> =>
  /* oxlint-disable typescript/no-unsafe-type-assertion -- every EnsforgeError is one of the AnyError classes */
  isEnsforgeError(cause)
    ? Promise.resolve(cause.withContext(context))
    : translation().then(({ fromCause }) => fromCause(cause, context) as AnyError);
/* oxlint-enable typescript/no-unsafe-type-assertion */

/**
 * {@link toAnyErrorAsync} as an Effect.
 *
 * @stability unstable
 */
export const toAnyError = (
  cause: unknown,
  context?: EnsforgeError.Context,
): Effect.Effect<AnyError> => Effect.promise(() => toAnyErrorAsync(cause, context));

/**
 * The ensforge error for a contract's raw revert data, decoded against every ENS contract error.
 *
 * @stability unstable
 */
export const fromRevertData = (
  data: Hex,
  context: EnsforgeError.Context,
): Effect.Effect<AnyError> =>
  Effect.promise(() => import("../errors/translate/revert.js")).pipe(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every EnsforgeError is one of the AnyError classes
    Effect.map(({ fromRevert }) => fromRevert({ data }, context) as AnyError),
  );

/**
 * Fails with `cause` translated into an ensforge error.
 *
 * @stability unstable
 */
export const failWith = (
  cause: unknown,
  context?: EnsforgeError.Context,
): Effect.Effect<never, AnyError> => Effect.flatMap(toAnyError(cause, context), Effect.fail);

/**
 * Runs synchronous code, failing with what it throws translated into an ensforge error.
 *
 * @stability unstable
 */
export const tryAny = <value>(
  evaluate: () => value,
  context?: EnsforgeError.Context,
): Effect.Effect<value, AnyError> =>
  Effect.try({ try: evaluate, catch: (cause) => new Untranslated({ cause }) }).pipe(
    Effect.catchTag("Untranslated", ({ cause }) => failWith(cause, context)),
  );
