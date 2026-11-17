import { Predicate } from "effect";

import {
  AbiDecodingDataSizeInvalidError,
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroDataError,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  HttpRequestError,
  RpcRequestError,
  RawContractError,
  SocketClosedError,
  TimeoutError,
  WebSocketRequestError,
  type Hex,
} from "viem";

import { ContractError, type ContractErrorCode } from "../../errors/contract-error.js";
import { RpcError } from "../../errors/rpc-error.js";

export type ViemOperation =
  | "encodeFunctionData"
  | "getBlock"
  | "estimateFeesPerGas"
  | "estimateGas"
  | "getLogs"
  | "readContract"
  | "multicall"
  | "simulateContract"
  | "watchEvent"
  | "writeContract";

export type ViemError = ContractError | RpcError;

const fallbackCodes = {
  encodeFunctionData: "ENCODE_FAILED",
  readContract: "READ_FAILED",
  multicall: "MULTICALL_FAILED",
  simulateContract: "SIMULATION_FAILED",
  estimateGas: "SIMULATION_FAILED",
  writeContract: "WRITE_FAILED",
} as const satisfies Record<
  Exclude<ViemOperation, "getBlock" | "getLogs" | "watchEvent" | "estimateFeesPerGas">,
  ContractErrorCode
>;

export const findViemErrorCause = <ErrorClass extends Error>(
  cause: unknown,
  errorClass: abstract new (...args: never[]) => ErrorClass,
): ErrorClass | undefined => {
  if (cause instanceof errorClass) {
    return cause;
  }

  if (!(cause instanceof BaseError)) {
    return undefined;
  }

  return (
    (cause.walk((error) => error instanceof errorClass) as ErrorClass | null | undefined) ??
    undefined
  );
};

export const isContractRevert = (cause: unknown, errorName: string): boolean =>
  findViemErrorCause(cause, ContractFunctionRevertedError)?.data?.errorName === errorName;

export const isContractRevertWithData = (
  cause: unknown,
  errorName: string,
  selector: Hex,
): boolean => {
  const revert = findViemErrorCause(cause, ContractFunctionRevertedError)?.data;
  const nestedData = revert?.args?.at(0);

  return (
    revert?.errorName === errorName &&
    Predicate.isString(nestedData) &&
    nestedData.startsWith(selector)
  );
};

const messageFromCause = (cause: unknown): string => {
  if (cause instanceof BaseError) {
    return cause.shortMessage;
  }

  if (Predicate.isError(cause)) {
    return cause.message;
  }

  return "An unknown Ethereum client error occurred";
};

const isDecodeError = (cause: unknown): boolean =>
  findViemErrorCause(cause, ContractFunctionZeroDataError) !== undefined ||
  findViemErrorCause(cause, AbiDecodingDataSizeInvalidError) !== undefined ||
  findViemErrorCause(cause, AbiDecodingDataSizeTooSmallError) !== undefined ||
  findViemErrorCause(cause, AbiDecodingZeroDataError) !== undefined;

export function viemErrorToEffectError(
  cause: unknown,
  operation: "getBlock" | "getLogs" | "watchEvent" | "estimateFeesPerGas",
): RpcError;
export function viemErrorToEffectError(
  cause: unknown,
  operation: Exclude<ViemOperation, "getBlock" | "getLogs" | "watchEvent" | "estimateFeesPerGas">,
): ViemError;
export function viemErrorToEffectError(cause: unknown, operation: ViemOperation): ViemError {
  const timeout = findViemErrorCause(cause, TimeoutError);

  if (timeout !== undefined) {
    return new RpcError({
      code: "REQUEST_TIMEOUT",
      message: timeout.shortMessage,
      cause,
    });
  }

  const request =
    findViemErrorCause(cause, RpcRequestError) ?? findViemErrorCause(cause, HttpRequestError);

  if (request !== undefined) {
    return new RpcError({
      code: "REQUEST_FAILED",
      message: request.shortMessage,
      cause,
    });
  }

  const transport =
    findViemErrorCause(cause, WebSocketRequestError) ??
    findViemErrorCause(cause, SocketClosedError);

  if (transport !== undefined) {
    return new RpcError({
      code: "TRANSPORT_FAILED",
      message: transport.shortMessage,
      cause,
    });
  }

  if (
    operation === "getBlock" ||
    operation === "getLogs" ||
    operation === "watchEvent" ||
    operation === "estimateFeesPerGas"
  ) {
    return new RpcError({
      code: "REQUEST_FAILED",
      message: messageFromCause(cause),
      cause,
    });
  }

  const reverted = findViemErrorCause(cause, ContractFunctionRevertedError);

  if (reverted !== undefined) {
    return new ContractError({
      code: "REVERTED",
      message: reverted.shortMessage,
      cause,
      revert: {
        ...(reverted.data?.errorName === undefined ? {} : { name: reverted.data.errorName }),
        ...(reverted.data?.args === undefined ? {} : { args: [...reverted.data.args] }),
      },
    });
  }

  const raw = findViemErrorCause(cause, RawContractError)?.data;
  const rawData = typeof raw === "string" ? raw : raw?.data;

  if (rawData !== undefined) {
    return new ContractError({
      code: "REVERTED",
      message: messageFromCause(cause),
      cause,
      revert: { data: rawData },
    });
  }

  if (isDecodeError(cause)) {
    return new ContractError({
      code: "DECODE_FAILED",
      message: messageFromCause(cause),
      cause,
    });
  }

  return new ContractError({
    code: fallbackCodes[operation],
    message: messageFromCause(cause),
    cause,
  });
}
