import { Context, Effect, Semaphore } from "effect";

import { Eip1559FeesNotSupportedError } from "viem";
import type {
  Account,
  Address,
  CallReturnType,
  GetCallsStatusReturnType,
  Hex,
  PublicClient,
  SendCallsReturnType,
  TransactionReceipt,
  WalletClient,
} from "viem";

import { defaultReadOptions } from "../../config/read-options.js";
import type { ContractError } from "../../errors/contract-error.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { TransactionError } from "../../errors/transaction-error.js";
import type { WalletError } from "../../errors/wallet-error.js";
import type { WorkflowError } from "../../errors/workflow-error.js";
import type { FeeEstimate, PreparedWriteCall } from "../../write/types.js";
import { findViemErrorCause, viemErrorToEffectError } from "../errors/viem-error.js";
import { batchStatusError, receiptWaitError, walletRequestError } from "../errors/write-error.js";
import { journalSubmission, journalKey } from "../workflows/journal.js";
import { ActiveWorkflow, WorkflowStep } from "../workflows/session.js";

export interface WaitForReceiptOptions {
  readonly confirmations?: number;
  readonly timeout?: number;
}

export interface SendNativeCallsOptions {
  readonly forceAtomic: boolean;
  readonly capabilities?: Readonly<Record<string, unknown>>;
}

export interface WriteClientService {
  readonly simulate: (
    call: PreparedWriteCall,
  ) => Effect.Effect<CallReturnType, ContractError | RpcError>;
  readonly estimateGas: (
    call: PreparedWriteCall,
    blockNumber: bigint,
  ) => Effect.Effect<bigint, ContractError | RpcError>;
  readonly estimateFeesPerGas: () => Effect.Effect<FeeEstimate, RpcError>;
  readonly sendTransaction: (
    walletClient: WalletClient,
    call: PreparedWriteCall,
  ) => Effect.Effect<Hex, ContractError | RpcError | WalletError | WorkflowError>;
  readonly waitForReceipt: (
    hash: Hex,
    options: WaitForReceiptOptions,
  ) => Effect.Effect<TransactionReceipt, RpcError | TransactionError>;
  readonly getCapabilities: (
    walletClient: WalletClient,
    account: Account | Address,
    chainId: number,
  ) => Effect.Effect<Readonly<Record<string, unknown>>, WalletError>;
  readonly sendCalls: (
    walletClient: WalletClient,
    account: Account | Address,
    calls: ReadonlyArray<PreparedWriteCall>,
    options: SendNativeCallsOptions,
  ) => Effect.Effect<SendCallsReturnType, WalletError | WorkflowError>;
  readonly waitForCallsStatus: (
    walletClient: WalletClient,
    id: string,
    options: WaitForReceiptOptions,
  ) => Effect.Effect<GetCallsStatusReturnType, TransactionError>;
  readonly getCallsStatus: (
    walletClient: WalletClient,
    id: string,
  ) => Effect.Effect<GetCallsStatusReturnType, TransactionError>;
}

export class WriteClient extends Context.Service<WriteClient, WriteClientService>()(
  "@ensforge/core/internal/write/WriteClient",
) {}

export const makeWriteClient = (
  publicClient: PublicClient,
  readSemaphore = Semaphore.makeUnsafe(defaultReadOptions.concurrency),
): WriteClientService =>
  WriteClient.of({
    simulate: Effect.fn("WriteClient.simulate")(function* (call) {
      const session = yield* ActiveWorkflow;
      const step = yield* WorkflowStep;
      const saved = session?.record.submissions[journalKey("transaction", [call], step).key];
      if (saved?.reference) return { data: undefined };

      return yield* readSemaphore.withPermit(
        Effect.tryPromise({
          try: () =>
            publicClient.call({
              account: typeof call.account === "string" ? call.account : call.account.address,
              to: call.to,
              ...(call.data === undefined ? {} : { data: call.data }),
              ...(call.value === 0n ? {} : { value: call.value }),
            }),
          catch: (cause) => viemErrorToEffectError(cause, "simulateContract"),
        }),
      );
    }),
    estimateGas: Effect.fn("WriteClient.estimateGas")((call, blockNumber) =>
      readSemaphore.withPermit(
        Effect.tryPromise({
          try: () =>
            publicClient.estimateGas({
              account: typeof call.account === "string" ? call.account : call.account.address,
              to: call.to,
              blockNumber,
              ...(call.data === undefined ? {} : { data: call.data }),
              ...(call.value === 0n ? {} : { value: call.value }),
            }),
          catch: (cause) => viemErrorToEffectError(cause, "estimateGas"),
        }),
      ),
    ),
    estimateFeesPerGas: Effect.fn("WriteClient.estimateFeesPerGas")(() =>
      readSemaphore.withPermit(
        Effect.tryPromise({
          try: () => publicClient.estimateFeesPerGas(),
          catch: (cause) => cause,
        }).pipe(
          Effect.map(({ maxFeePerGas, maxPriorityFeePerGas }): FeeEstimate => ({
            type: "eip1559",
            maxFeePerGas,
            maxPriorityFeePerGas,
          })),
          Effect.catch((cause) =>
            findViemErrorCause(cause, Eip1559FeesNotSupportedError) === undefined
              ? Effect.fail(viemErrorToEffectError(cause, "estimateFeesPerGas"))
              : Effect.tryPromise({
                  try: () => publicClient.getGasPrice(),
                  catch: (legacyCause) => viemErrorToEffectError(legacyCause, "estimateFeesPerGas"),
                }).pipe(Effect.map((gasPrice): FeeEstimate => ({ type: "legacy", gasPrice }))),
          ),
        ),
      ),
    ),
    sendTransaction: Effect.fn("WriteClient.sendTransaction")((walletClient, call) =>
      journalSubmission(
        "transaction",
        [call],
        () =>
          Effect.tryPromise({
            try: () =>
              walletClient.sendTransaction({
                account: call.account,
                chain: walletClient.chain,
                to: call.to,
                ...(call.data === undefined ? {} : { data: call.data }),
                ...(call.value === 0n ? {} : { value: call.value }),
              }),
            catch: (cause) => walletRequestError(cause, "sendTransaction"),
          }),
        (hash) => hash,
        (hash) => hash as Hex,
      ),
    ),
    waitForReceipt: Effect.fn("WriteClient.waitForReceipt")((hash, options) =>
      Effect.tryPromise({
        try: () =>
          publicClient.waitForTransactionReceipt({
            hash,
            ...(options.confirmations === undefined
              ? {}
              : { confirmations: options.confirmations }),
            ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
          }),
        catch: (cause) => receiptWaitError(cause, hash),
      }).pipe(
        Effect.flatMap((receipt) =>
          receipt.status === "success"
            ? Effect.succeed(receipt)
            : Effect.fail(
                new TransactionError({
                  code: "RECEIPT_REVERTED",
                  message: `Transaction ${hash} reverted`,
                  cause: receipt,
                  transactionHash: hash,
                }),
              ),
        ),
      ),
    ),
    getCapabilities: Effect.fn("WriteClient.getCapabilities")((walletClient, account, chainId) =>
      Effect.tryPromise({
        try: () => walletClient.getCapabilities({ account, chainId }),
        catch: (cause) => walletRequestError(cause, "capabilities"),
      }),
    ),
    sendCalls: Effect.fn("WriteClient.sendCalls")((walletClient, account, calls, options) =>
      journalSubmission(
        "batch",
        calls,
        () =>
          Effect.tryPromise({
            try: () =>
              walletClient.sendCalls({
                account,
                chain: walletClient.chain,
                calls: calls.map((call) => ({
                  to: call.to,
                  ...(call.data === undefined ? {} : { data: call.data }),
                  ...(call.value === 0n ? {} : { value: call.value }),
                })),
                forceAtomic: options.forceAtomic,
                ...(options.capabilities === undefined
                  ? {}
                  : { capabilities: options.capabilities }),
              }),
            catch: (cause) => walletRequestError(cause, "sendCalls"),
          }),
        (batch) => batch.id,
        (id) => ({ id }),
      ),
    ),
    waitForCallsStatus: Effect.fn("WriteClient.waitForCallsStatus")((walletClient, id, options) =>
      Effect.tryPromise({
        try: () =>
          walletClient.waitForCallsStatus({
            id,
            throwOnFailure: false,
            ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
          }),
        catch: (cause) => batchStatusError(cause, id),
      }),
    ),
    getCallsStatus: Effect.fn("WriteClient.getCallsStatus")((walletClient, id) =>
      Effect.tryPromise({
        try: () => walletClient.getCallsStatus({ id }),
        catch: (cause) => batchStatusError(cause, id),
      }),
    ),
  });
