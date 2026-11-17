import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

/**
 * Something failed that ensforge does not recognise. The original error is in `cause`.
 *
 * @category errors
 * @since 1.0.0
 */
export class InternalError extends EnsforgeError<"InternalError", InternalError.Code> {
  constructor(options: InternalError.Options) {
    super(
      "InternalError",
      withDefaults(
        {
          shortMessage: "An unexpected error occurred.",
          hint: "If this persists, report it at https://github.com/thenamespace/ensforge/issues with the cause.",
        },
        options,
      ),
    );
  }
}

export declare namespace InternalError {
  type Code = "UNEXPECTED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
