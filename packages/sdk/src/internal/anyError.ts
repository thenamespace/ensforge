import type { EnsforgeError } from "../errors/EnsforgeError.js";
import { fromCause } from "../errors/translate/fromCause.js";
import type { AnyError } from "../errors/types.js";

/**
 * `fromCause` typed as the union of ensforge error classes, for an Effect's error channel.
 *
 * ensforge errors are returned as the same instance, so a `catch` that receives one already
 * thrown by ensforge code keeps it unchanged.
 *
 * @stability unstable
 */
export const toAnyError = (cause: unknown, context?: EnsforgeError.Context): AnyError =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every EnsforgeError is one of the AnyError classes
  fromCause(cause, context) as AnyError;
