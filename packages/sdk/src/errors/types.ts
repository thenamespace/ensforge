import type * as Classes from "./classes/index.js";

/**
 * Every error class ensforge throws.
 *
 * @stability stable
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
 * Errors every action can fail with, besides the ones its `@throws` documents: a misconfigured
 * client or a contract missing on the chain (`ConfigError`, `CONTRACT_NOT_DEPLOYED`), a failing RPC (`NetworkError`), a contract call
 * reverting with an error ensforge does not map (`ContractRevertError`), and anything ensforge
 * could not translate (`InternalError` `UNEXPECTED`).
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export type CommonError =
  | Classes.ConfigError
  | Classes.ContractRevertError
  | Classes.InternalError
  | Classes.NetworkError;

/**
 * Errors every write can fail with, besides the ones its `@throws` documents: `CommonError` and
 * the errors of signing and sending, also on `.prepare`, `.simulate`, `.estimateGas` and the
 * `…Sync` form.
 *
 * **Details**
 *
 * - `WalletError`, or `ConfigError` (`WALLET_NOT_CONFIGURED`), when the wallet cannot sign.
 * - `UserRejectedError` when the wallet's user declines.
 * - `InsufficientFundsError` (`INSUFFICIENT_ETH`) when the account cannot pay for gas or the
 *   ETH the call sends.
 * - `UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) when the wallet cannot send a batch.
 * - `TransactionError` when a transaction reverts, conflicts or is not mined in time.
 * - A `via` route can also fail with its own package's errors (e.g. `HcaError`).
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export type WriteError =
  | CommonError
  | Classes.InsufficientFundsError
  | Classes.TransactionError
  | Classes.UnsupportedError
  | Classes.UserRejectedError
  | Classes.WalletError;

/**
 * Every error code. Codes are stable: renaming or removing one is a breaking change.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export type Code = AnyError["code"];

/**
 * The error class that can carry `code`, e.g. `ErrorOf<"MISSING_ROLES">` is `UnauthorizedError`.
 *
 * @stability stable
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
