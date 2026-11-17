import {
  AtomicityNotSupportedError,
  BaseError,
  InvalidRequestRpcError,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  UnauthorizedProviderError,
  UnsupportedChainIdError,
  TimeoutError,
  UserRejectedRequestError,
} from "viem";

import { TransactionError } from "../../errors/transaction-error.js";
import { WalletError } from "../../errors/wallet-error.js";
import { findViemErrorCause, viemErrorToEffectError, type ViemError } from "./viem-error.js";

const messageFromCause = (cause: unknown): string =>
  cause instanceof BaseError ? cause.shortMessage : "The wallet request failed";

export const isWalletCallBundleUnsupported = (cause: unknown): boolean => {
  if (
    findViemErrorCause(cause, MethodNotFoundRpcError) !== undefined ||
    findViemErrorCause(cause, MethodNotSupportedRpcError) !== undefined
  ) {
    return true;
  }

  const invalidRequest = findViemErrorCause(cause, InvalidRequestRpcError);

  return (
    invalidRequest !== undefined &&
    /unsupported method.*wallet_(?:getCapabilities|sendCalls)/i.test(invalidRequest.details)
  );
};

export function walletRequestError(
  cause: unknown,
  operation: "capabilities" | "sendCalls",
): WalletError;
export function walletRequestError(
  cause: unknown,
  operation: "sendTransaction",
): ViemError | WalletError;
export function walletRequestError(
  cause: unknown,
  operation: "capabilities" | "sendCalls" | "sendTransaction",
): ViemError | WalletError {
  if (findViemErrorCause(cause, UserRejectedRequestError) !== undefined) {
    return new WalletError({
      code: "USER_REJECTED",
      message: "The wallet request was rejected by the user",
      cause,
    });
  }

  if (
    findViemErrorCause(cause, UnauthorizedProviderError) !== undefined ||
    findViemErrorCause(cause, UnsupportedChainIdError) !== undefined
  ) {
    return new WalletError({
      code: "UNAUTHORIZED_ACCOUNT",
      message: messageFromCause(cause),
      cause,
    });
  }

  if (findViemErrorCause(cause, AtomicityNotSupportedError) !== undefined) {
    return new WalletError({
      code: "ATOMICITY_UNAVAILABLE",
      message: "The wallet cannot execute this call group atomically",
      cause,
    });
  }

  if (operation === "capabilities") {
    return new WalletError({
      code: "CAPABILITY_REQUEST_FAILED",
      message: messageFromCause(cause),
      cause,
    });
  }

  if (operation === "sendCalls") {
    return new WalletError({
      code: "BATCH_SUBMISSION_FAILED",
      message: messageFromCause(cause),
      cause,
    });
  }

  return viemErrorToEffectError(cause, "writeContract");
}

export const batchStatusError = (cause: unknown, batchId: string) =>
  new TransactionError({
    code:
      findViemErrorCause(cause, TimeoutError) === undefined
        ? "BATCH_STATUS_FAILED"
        : "CONFIRMATION_TIMEOUT",
    message:
      findViemErrorCause(cause, TimeoutError) === undefined
        ? "Unable to read the wallet call-batch status"
        : "Timed out while waiting for the wallet call batch",
    cause,
    batchId,
  });

export const receiptWaitError = (cause: unknown, transactionHash: `0x${string}`) =>
  findViemErrorCause(cause, TimeoutError) === undefined
    ? viemErrorToEffectError(cause, "getBlock")
    : new TransactionError({
        code: "CONFIRMATION_TIMEOUT",
        message: `Timed out while waiting for transaction ${transactionHash}`,
        cause,
        transactionHash,
      });
