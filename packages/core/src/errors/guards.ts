import type { AnyError, Code, ErrorOf } from "./types.js";

/**
 * Whether `value` is an ensforge error. Uses a brand instead of `instanceof`, so it also works
 * when two copies of `@ensforge/core` are installed.
 *
 * @category errors
 * @since 1.0.0
 */
export const isEnsforgeError = (value: unknown): value is AnyError =>
  typeof value === "object" &&
  value !== null &&
  (value as { "~ensforge/error"?: unknown })["~ensforge/error"] === true;

/**
 * Returns a type guard that matches ensforge errors with one of `codes`.
 *
 * **Example** (Branching on a code)
 *
 * ```ts
 * import { Errors } from "@ensforge/core"
 *
 * if (Errors.hasCode("NAME_NOT_AVAILABLE", "NAME_RESERVED")(error)) suggestAlternatives()
 * ```
 *
 * @category errors
 * @since 1.0.0
 */
export const hasCode =
  <const codes extends readonly Code[]>(...codes: codes) =>
  (value: unknown): value is ErrorOf<codes[number]> =>
    isEnsforgeError(value) && (codes as readonly string[]).includes(value.code);
