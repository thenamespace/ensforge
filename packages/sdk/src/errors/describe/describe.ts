import { InternalError } from "../classes/InternalError.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { fromCause } from "../translate/fromCause.js";
import type { AnyError, Code } from "../types.js";
import { messages, type Copy } from "./messages.js";
import { extensionMessages, type Template } from "./registry.js";

/**
 * User-facing description of an error.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export type Description = Copy & {
  /** A code of `Errors.Code`, or of a package that extends ensforge (e.g. `HcaError`). */
  readonly code: Code | (string & {});
  readonly retryable: boolean;
  /** `info`: expected outcome; `warning`: temporary, retry later; `error`: needs attention. */
  readonly severity: "info" | "warning" | "error";
};

/**
 * Options for {@link describe}. `error` is the union of error classes whose codes `messages`
 * may override: every sdk error by default; add a package's class to override its codes too,
 * e.g. `DescribeOptions<Errors.AnyError | HcaError>`.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export type DescribeOptions<error extends EnsforgeError = AnyError> = {
  /** Replacement copy by code, e.g. translations. Missing fields fall back to the English copy. */
  readonly messages?: {
    readonly [code in error["code"]]?: (
      error: error extends { readonly code: infer codes }
        ? code extends codes
          ? error
          : never
        : never,
    ) => Partial<Copy>;
  };
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each template receives an error with its code
const sdkMessages = messages as unknown as Readonly<Partial<Record<string, Template>>>;
const generic: Template = (error) =>
  messages.UNEXPECTED(new InternalError({ code: "UNEXPECTED", context: error.context }));

const expected = new Set([
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
 * - Packages that extend ensforge, such as `@ensforge/hca`, add copy for their own codes; a code
 *   without copy gets the generic `UNEXPECTED` copy.
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
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export const describe = <error extends EnsforgeError = AnyError>(
  value: unknown,
  options: DescribeOptions<error> = {},
): Description => {
  const error = fromCause(value);
  const template = sdkMessages[error.code] ?? extensionMessages.get(error.code) ?? generic;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- overrides are keyed by the code of the error they receive
  const overrides = options.messages as
    | Readonly<Partial<Record<string, (error: EnsforgeError) => Partial<Copy>>>>
    | undefined;

  return {
    ...template(error),
    ...overrides?.[error.code]?.(error),
    code: error.code,
    retryable: error.retryable,
    severity: expected.has(error._tag) ? "info" : error.retryable ? "warning" : "error",
  };
};
