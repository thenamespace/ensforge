import { fromCause } from "../translate/fromCause.js";
import type { AnyError, Code, ErrorOf } from "../types.js";
import { messages, type Copy } from "./messages.js";

/**
 * User-facing description of an error.
 *
 * @category errors
 * @since 1.0.0
 */
export type Description = Copy & {
  readonly code: Code;
  readonly retryable: boolean;
  /** `info`: expected outcome; `warning`: temporary, retry later; `error`: needs attention. */
  readonly severity: "info" | "warning" | "error";
};

/**
 * Options for {@link describe}.
 *
 * @category errors
 * @since 1.0.0
 */
export type DescribeOptions = {
  /** Replacement copy by code, e.g. translations. Missing fields fall back to the English copy. */
  readonly messages?: {
    readonly [code in Code]?: (error: ErrorOf<code>) => Partial<Copy>;
  };
};

const expected = new Set<AnyError["_tag"]>([
  "UserRejectedError",
  "NameStateError",
  "NotFoundError",
  "CommitmentError",
]);

/**
 * Turns any thrown value into a title, message and suggested action that are safe to show users.
 *
 * **When to use**
 *
 * Use in UI error handlers instead of showing `error.message`, which is written for developers.
 *
 * **Details**
 *
 * - Accepts any value; non-ensforge errors go through `Errors.fromCause` first.
 * - Override copy per code with `messages`, for example to translate.
 *
 * **Example** (Showing an error toast)
 *
 * ```ts
 * import { Errors } from "@ensforge/sdk"
 *
 * try {
 *   await ens.record.set({ name: "alice.eth", texts: { url: "https://alice.dev" } })
 * } catch (error) {
 *   const { title, message, action } = Errors.describe(error)
 *   toast({ title, description: action === undefined ? message : `${message} ${action}` })
 * }
 * ```
 *
 * **Example** (Translating one code)
 *
 * ```ts
 * import { Errors } from "@ensforge/sdk"
 *
 * Errors.describe(error, {
 *   messages: { NAME_NOT_AVAILABLE: (e) => ({ title: "Nombre no disponible", message: `${e.context.name} ya está registrado.` }) },
 * })
 * ```
 *
 * @category errors
 * @since 1.0.0
 */
export const describe = (value: unknown, options: DescribeOptions = {}): Description => {
  const error = fromCause(value) as AnyError;
  const template = messages[error.code] as (error: AnyError) => Copy;
  const override = options.messages?.[error.code] as
    | ((error: AnyError) => Partial<Copy>)
    | undefined;

  return {
    ...template(error),
    ...override?.(error),
    code: error.code,
    retryable: error.retryable,
    severity: expected.has(error._tag) ? "info" : error.retryable ? "warning" : "error",
  };
};
