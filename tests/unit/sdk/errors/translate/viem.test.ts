import { assert, describe, it } from "@effect/vitest";

import { Abis } from "@ensforge/contracts";
import { GatewayError } from "@ensforge/sdk/internal/errors/classes/index";
import { fromViemError } from "@ensforge/sdk/internal/errors/translate/viem";
import {
  BaseError,
  ChainMismatchError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  encodeErrorResult,
  ExecutionRevertedError,
  getAddress,
  HttpRequestError,
  InsufficientFundsError,
  LimitExceededRpcError,
  NonceTooHighError,
  NonceTooLowError,
  RawContractError,
  RpcRequestError,
  SocketClosedError,
  TimeoutError,
  UnsupportedNonOptionalCapabilityError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  WebSocketRequestError,
} from "viem";
import { mainnet } from "viem/chains";

const url = "https://rpc.test";
const contract = getAddress("0x00000000000000000000000000000000000000c3");
const notOwner = encodeErrorResult({ abi: Abis.shared.errors, errorName: "Unauthorised" });

/** An error that viem does not export from its entry point, matched by name like any other. */
const named = (name: string, fields: object = {}) =>
  Object.assign(new Error(name), { name }, fields);

const executionError = (cause: BaseError) =>
  new ContractFunctionExecutionError(cause, {
    abi: Abis.shared.errors,
    functionName: "setText",
    contractAddress: contract,
  });

describe("fromViemError wallet errors", () => {
  it.each([
    { label: "UserRejectedRequestError", cause: new UserRejectedRequestError(new Error("no")) },
    {
      label: "an EIP-1193 4001 error under a generic error",
      cause: new Error("wrapped", { cause: { code: 4001, message: "rejected" } }),
    },
    {
      label: "a rejection inside a contract write",
      cause: executionError(new UserRejectedRequestError(new Error("no"))),
    },
  ])("$label → USER_REJECTED", ({ cause }) => {
    const error = fromViemError(cause);

    assert.strictEqual(error?._tag, "UserRejectedError");
    assert.strictEqual(error?.code, "USER_REJECTED");
  });

  it.each([
    {
      cause: new InsufficientFundsError(),
      _tag: "InsufficientFundsError",
      code: "INSUFFICIENT_ETH",
    },
    {
      cause: new ChainMismatchError({ chain: mainnet, currentChainId: 5 }),
      _tag: "WalletError",
      code: "CHAIN_MISMATCH",
    },
    { cause: named("AccountNotFoundError"), _tag: "ConfigError", code: "WALLET_NOT_CONFIGURED" },
    {
      cause: new UnsupportedNonOptionalCapabilityError(new Error("atomic")),
      _tag: "UnsupportedError",
      code: "WALLET_BATCH_UNSUPPORTED",
    },
    { cause: new NonceTooLowError(), _tag: "TransactionError", code: "NONCE_CONFLICT" },
    { cause: new NonceTooHighError(), _tag: "TransactionError", code: "NONCE_CONFLICT" },
    {
      cause: new WaitForTransactionReceiptTimeoutError({ hash: `0x${"ab".repeat(32)}` }),
      _tag: "TransactionError",
      code: "RECEIPT_TIMEOUT",
    },
  ])("$cause.name → $code", ({ cause, _tag, code }) => {
    const error = fromViemError(cause);

    assert.strictEqual(error?._tag, _tag);
    assert.strictEqual(error?.code, code);
    assert.strictEqual(error?.cause, cause);
  });
});

describe("fromViemError contract errors", () => {
  it("decodes a revert nested in a contract call and keeps the call details", () => {
    const reverted = new ContractFunctionRevertedError({
      abi: Abis.shared.errors,
      data: notOwner,
      functionName: "setText",
    });
    const cause = executionError(reverted);
    const error = fromViemError(cause, { operation: "record.set" });

    assert.strictEqual(error?.code, "NOT_OWNER");
    assert.strictEqual(error?.cause, cause);
    assert.deepStrictEqual(error?.context, {
      operation: "record.set",
      contract,
      functionName: "setText",
      revert: { errorName: "Unauthorised", data: notOwner },
    });
  });

  it.each([
    {
      label: "a revert viem could not decode",
      cause: new ContractFunctionRevertedError({ abi: [], data: notOwner, functionName: "f" }),
    },
    { label: "RawContractError with hex data", cause: new RawContractError({ data: notOwner }) },
    {
      label: "RawContractError with nested data",
      cause: new RawContractError({ data: { data: notOwner } }),
    },
    {
      label: "ExecutionRevertedError with data on the RPC error",
      cause: new ExecutionRevertedError({
        cause: Object.assign(new BaseError("rpc"), { data: notOwner }),
      }),
    },
    {
      label: "a JSON-RPC code 3 error",
      cause: new Error("call failed", {
        cause: { code: 3, message: "execution reverted", data: notOwner },
      }),
    },
  ])("$label is decoded from the raw data", ({ cause }) => {
    assert.strictEqual(fromViemError(cause)?.code, "NOT_OWNER");
  });

  it("an execution revert without data is CONTRACT_REVERTED", () => {
    const error = fromViemError(new ExecutionRevertedError());

    assert.strictEqual(error?.code, "CONTRACT_REVERTED");
    assert.isUndefined((error as { data?: unknown }).data);
  });

  it("zero return data means the contract is not deployed", () => {
    const error = fromViemError(new ContractFunctionZeroDataError({ functionName: "owner" }));

    assert.strictEqual(error?._tag, "ConfigError");
    assert.strictEqual(error?.code, "CONTRACT_NOT_DEPLOYED");
  });
});

describe("fromViemError gateway errors", () => {
  it.each([
    { cause: named("OffchainLookupSenderMismatchError"), code: "OFFCHAIN_LOOKUP_INVALID" },
    { cause: named("OffchainLookupResponseMalformedError"), code: "GATEWAY_RESPONSE_INVALID" },
  ])("$cause.name → $code", ({ cause, code }) => {
    const error = fromViemError(cause);

    assert.strictEqual(error?._tag, "GatewayError");
    assert.strictEqual(error?.code, code);
  });

  it("an offchain lookup HTTP failure is a gateway failure, not an RPC failure", () => {
    const http = new HttpRequestError({ url: "https://gw.test", status: 502 });
    const error = fromViemError(named("OffchainLookupError", { cause: http }));

    assert.instanceOf(error, GatewayError);
    assert.strictEqual(error.code, "GATEWAY_REQUEST_FAILED");
    assert.strictEqual(error.status, 502);
    assert.strictEqual(error.url, "https://gw.test");
    assert.isTrue(error.retryable);
  });
});

describe("fromViemError transport errors", () => {
  it.each([
    { cause: new HttpRequestError({ url, status: 429 }), code: "RATE_LIMITED", status: 429 },
    {
      cause: new LimitExceededRpcError(new Error("limit")),
      code: "RATE_LIMITED",
      status: undefined,
    },
    { cause: new TimeoutError({ body: {}, url }), code: "RPC_TIMEOUT", status: undefined },
    { cause: new HttpRequestError({ url, status: 500 }), code: "RPC_REQUEST_FAILED", status: 500 },
    {
      cause: new RpcRequestError({ body: {}, error: { code: -32000, message: "bad" }, url }),
      code: "RPC_REQUEST_FAILED",
      status: undefined,
    },
    {
      cause: new WebSocketRequestError({ body: {}, url }),
      code: "RPC_REQUEST_FAILED",
      status: undefined,
    },
    { cause: new SocketClosedError({ url }), code: "RPC_REQUEST_FAILED", status: undefined },
  ])("$cause.name ($status) → $code", ({ cause, code, status }) => {
    const error = fromViemError(cause);

    assert.strictEqual(error?._tag, "NetworkError");
    assert.strictEqual(error?.code, code);
    assert.strictEqual((error as { status?: number }).status, status);
    assert.isTrue(error?.retryable);
  });
});

describe("fromViemError unknown errors", () => {
  const cyclic: { name: string; cause?: unknown } = { name: "Loop" };
  cyclic.cause = cyclic;

  it.each([
    { label: "a plain Error", cause: new Error("boom") },
    { label: "a viem BaseError", cause: new BaseError("unknown") },
    { label: "a string", cause: "boom" },
    { label: "null", cause: null },
    { label: "a cyclic cause chain", cause: cyclic },
  ])("returns undefined for $label", ({ cause }) => {
    assert.isUndefined(fromViemError(cause));
  });
});
