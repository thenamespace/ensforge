import type { Address, Hex } from "viem";

import {
  ConfigError,
  GatewayError,
  InsufficientFundsError,
  NetworkError,
  TransactionError,
  UnsupportedError,
  UserRejectedError,
  WalletError,
} from "../classes/index.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { fromRevert } from "./revert.js";

/** The fields ensforge reads from viem errors. Matching by `name` survives duplicate viem copies. */
type ViemErrorLike = {
  readonly name?: string;
  readonly code?: number;
  readonly status?: number;
  readonly url?: string;
  readonly cause?: unknown;
  readonly data?: unknown;
  readonly raw?: Hex;
  readonly contractAddress?: Address;
  readonly functionName?: string;
};

const causeChain = (cause: unknown): readonly ViemErrorLike[] => {
  const chain: ViemErrorLike[] = [];
  const seen = new Set<unknown>();
  let current = cause;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    chain.push(current as ViemErrorLike);
    current = (current as ViemErrorLike).cause;
  }

  return chain;
};

const find = (chain: readonly ViemErrorLike[], ...names: readonly string[]) =>
  chain.find((error) => error.name !== undefined && names.includes(error.name));

const fromContractError = (
  chain: readonly ViemErrorLike[],
  context: EnsforgeError.Context,
): EnsforgeError | undefined => {
  const reverted = find(chain, "ContractFunctionRevertedError");
  if (reverted !== undefined) {
    const data = reverted.data as
      | { readonly errorName?: string; readonly args?: readonly unknown[] }
      | undefined;
    return fromRevert(
      { errorName: data?.errorName, args: data?.args, data: reverted.raw },
      context,
    );
  }

  const raw = find(chain, "RawContractError")?.data;
  const rawData =
    typeof raw === "string" ? raw : (raw as { readonly data?: Hex } | undefined)?.data;
  if (rawData !== undefined) return fromRevert({ data: rawData as Hex }, context);

  // `eth_call` reverts arrive as JSON-RPC code 3; the revert data is on the RPC error, if any.
  const executionReverted =
    find(chain, "ExecutionRevertedError") ?? chain.find((error) => error.code === 3);
  if (executionReverted !== undefined) {
    const revertData = chain
      .map((error) => error.data)
      .find((data) => typeof data === "string" && data.length > 2);
    return fromRevert({ data: revertData as Hex | undefined }, context);
  }

  if (find(chain, "ContractFunctionZeroDataError") !== undefined) {
    return new ConfigError({ code: "CONTRACT_NOT_DEPLOYED" });
  }

  return undefined;
};

const fromGatewayError = (chain: readonly ViemErrorLike[]): EnsforgeError | undefined => {
  if (find(chain, "OffchainLookupSenderMismatchError") !== undefined) {
    return new GatewayError({ code: "OFFCHAIN_LOOKUP_INVALID" });
  }
  if (find(chain, "OffchainLookupResponseMalformedError") !== undefined) {
    return new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" });
  }
  if (find(chain, "OffchainLookupError") !== undefined) {
    const http = find(chain, "HttpRequestError");
    return new GatewayError({
      code: "GATEWAY_REQUEST_FAILED",
      status: http?.status,
      url: http?.url,
    });
  }
  return undefined;
};

const fromTransportError = (chain: readonly ViemErrorLike[]): EnsforgeError | undefined => {
  const http = find(chain, "HttpRequestError");

  if (http?.status === 429 || find(chain, "LimitExceededRpcError") !== undefined) {
    return new NetworkError({ code: "RATE_LIMITED", status: http?.status });
  }
  if (find(chain, "TimeoutError") !== undefined) return new NetworkError({ code: "RPC_TIMEOUT" });

  const request = find(
    chain,
    "HttpRequestError",
    "RpcRequestError",
    "WebSocketRequestError",
    "SocketClosedError",
  );
  if (request !== undefined)
    return new NetworkError({ code: "RPC_REQUEST_FAILED", status: http?.status });

  return undefined;
};

const fromWalletError = (chain: readonly ViemErrorLike[]): EnsforgeError | undefined => {
  if (
    find(chain, "UserRejectedRequestError") !== undefined ||
    chain.some((error) => error.code === 4001)
  ) {
    return new UserRejectedError({ code: "USER_REJECTED" });
  }
  if (find(chain, "InsufficientFundsError") !== undefined) {
    return new InsufficientFundsError({ code: "INSUFFICIENT_ETH" });
  }
  if (find(chain, "ChainMismatchError") !== undefined)
    return new WalletError({ code: "CHAIN_MISMATCH" });
  if (find(chain, "AccountNotFoundError") !== undefined) {
    return new ConfigError({ code: "WALLET_NOT_CONFIGURED" });
  }
  if (find(chain, "UnsupportedNonOptionalCapabilityError") !== undefined) {
    return new UnsupportedError({ code: "WALLET_BATCH_UNSUPPORTED" });
  }
  if (find(chain, "NonceTooLowError", "NonceTooHighError") !== undefined) {
    return new TransactionError({ code: "NONCE_CONFLICT" });
  }
  if (find(chain, "WaitForTransactionReceiptTimeoutError") !== undefined) {
    return new TransactionError({ code: "RECEIPT_TIMEOUT" });
  }
  return undefined;
};

/**
 * Translates a viem error into an ensforge error, or returns `undefined` when it is not a viem
 * error ensforge recognises. The original error is kept as `cause`.
 */
export const fromViemError = (
  cause: unknown,
  outer: EnsforgeError.Context = {},
): EnsforgeError | undefined => {
  const chain = causeChain(cause);
  // viem attaches the contract call to `ContractFunctionExecutionError`.
  const execution = find(chain, "ContractFunctionExecutionError");
  const context =
    execution === undefined
      ? outer
      : { ...outer, contract: execution.contractAddress, functionName: execution.functionName };
  const translated =
    fromWalletError(chain) ??
    fromContractError(chain, context) ??
    fromGatewayError(chain) ??
    fromTransportError(chain);

  if (translated === undefined) return undefined;

  return translated.withCause(cause).withContext(context);
};
