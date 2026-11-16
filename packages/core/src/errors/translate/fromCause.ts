import { InternalError } from "../classes/index.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { isEnsforgeError } from "../guards.js";
import { fromViemError } from "./viem.js";

/**
 * Translates any thrown value into an ensforge error and adds `context`.
 *
 * **When to use**
 *
 * Use when calling viem directly next to ensforge actions, to get the same error classes, codes
 * and `Errors.describe` messages. Every ensforge action already does this.
 *
 * **Details**
 *
 * - ensforge errors are returned as-is, with `context` merged in.
 * - viem errors are matched along their `cause` chain; contract reverts are decoded against every
 *   ENS contract error, unwrapping `ResolverError` and the mainnet `ResolutionError`.
 * - Anything else becomes `InternalError` (`UNEXPECTED`) with the original as `cause`.
 *
 * **Example** (Translating a viem error)
 *
 * ```ts
 * import { Errors } from "@ensforge/core"
 *
 * try {
 *   await walletClient.writeContract(request)
 * } catch (cause) {
 *   const error = Errors.fromCause(cause, { operation: "custom.write" })
 *   toast(Errors.describe(error).title)
 * }
 * ```
 *
 * @category errors
 * @since 1.0.0
 */
export const fromCause = (cause: unknown, context?: EnsforgeError.Context): EnsforgeError => {
  if (isEnsforgeError(cause)) return cause.withContext(context);

  const translated =
    fromViemError(cause, context) ?? new InternalError({ code: "UNEXPECTED", cause });
  return translated.withContext(context);
};
