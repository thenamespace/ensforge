import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

/**
 * The user declined the request in their wallet.
 *
 * @category errors
 * @since 1.0.0
 */
export class UserRejectedError extends EnsforgeError<"UserRejectedError", UserRejectedError.Code> {
  constructor(options: UserRejectedError.Options) {
    super(
      "UserRejectedError",
      withDefaults({ shortMessage: "The user rejected the request." }, options),
    );
  }
}

export declare namespace UserRejectedError {
  type Code = "USER_REJECTED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
