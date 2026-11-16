import type * as Classes from "./classes/index.js";

/**
 * Every error class ensforge throws.
 *
 * @category errors
 * @since 1.0.0
 */
export type AnyError =
  | Classes.CommitmentError
  | Classes.ConfigError
  | Classes.ContractRevertError
  | Classes.DnsError
  | Classes.GatewayError
  | Classes.IndexerError
  | Classes.InsufficientFundsError
  | Classes.InternalError
  | Classes.InvalidInputError
  | Classes.MigrationError
  | Classes.NameStateError
  | Classes.NetworkError
  | Classes.NotFoundError
  | Classes.PlanError
  | Classes.TransactionError
  | Classes.UnauthorizedError
  | Classes.UnsupportedError
  | Classes.UserRejectedError
  | Classes.WalletError;

/**
 * Every error code. Codes are stable: renaming or removing one is a breaking change.
 *
 * @category errors
 * @since 1.0.0
 */
export type Code = AnyError["code"];

/**
 * The error class that can carry `code`, e.g. `ErrorOf<"MISSING_ROLES">` is `UnauthorizedError`.
 *
 * @category errors
 * @since 1.0.0
 */
export type ErrorOf<code extends Code> = AnyError extends infer error
  ? error extends { readonly code: infer codes }
    ? code extends codes
      ? error
      : never
    : never
  : never;
