import { Effect } from "effect";

import type { WalletClient } from "viem";

import type { EnsforgeConfig } from "../../config/config.js";
import { TransactionError } from "../../errors/transaction-error.js";
import type {
  ConfirmationPolicy,
  NativeBatchResult,
  WalletCapabilitiesResult,
} from "../../write/types.js";
import { WriteClient } from "./write-client.js";

export const confirmNativeBatch: (
  config: EnsforgeConfig,
  walletClient: WalletClient,
  id: string,
  calls: ReadonlyArray<{ readonly id: string; readonly operation: string }>,
  capabilities: WalletCapabilitiesResult,
  confirmation: ConfirmationPolicy,
  submittedAtomic: boolean,
) => Effect.Effect<NativeBatchResult, TransactionError, WriteClient> = Effect.fn(
  "confirmNativeBatch",
)(function* (
  config: EnsforgeConfig,
  walletClient: WalletClient,
  id: string,
  calls: ReadonlyArray<{ readonly id: string; readonly operation: string }>,
  capabilities: WalletCapabilitiesResult,
  confirmation: ConfirmationPolicy,
  submittedAtomic: boolean,
): Effect.fn.Return<NativeBatchResult, TransactionError, WriteClient> {
  if (confirmation.type === "submitted") {
    return {
      mode: "batch",
      atomic: submittedAtomic,
      status: "submitted",
      id,
      calls: calls.map((call) => ({
        id: call.id,
        operation: call.operation,
        status: "submitted",
        hash: null,
        receipt: null,
      })),
      receipts: [],
      capabilities,
    } satisfies NativeBatchResult;
  }

  const client = yield* WriteClient;

  const status = yield* client
    .waitForCallsStatus(
      walletClient,
      id,
      confirmation.timeout === undefined ? {} : { timeout: confirmation.timeout },
    )
    .pipe(Effect.retry({ times: config.writes.statusRetries }));

  if (status.status !== "success") {
    return yield* new TransactionError({
      code: status.status === undefined ? "INVALID_BATCH_STATUS" : "BATCH_STATUS_FAILED",
      message: `Wallet call batch ${id} finished with status ${status.status ?? status.statusCode}`,
      cause: status,
      batchId: id,
    });
  }

  const receipts = status.receipts ?? [];

  return {
    mode: "batch",
    atomic: status.atomic,
    status: "confirmed",
    id,
    calls: calls.map((call, index) => {
      const receipt = receipts[index] ?? (status.atomic ? receipts[0] : undefined);

      return {
        id: call.id,
        operation: call.operation,
        status: "confirmed",
        hash: receipt?.transactionHash ?? null,
        receipt: receipt ?? null,
      };
    }),
    receipts,
    capabilities,
  } satisfies NativeBatchResult;
});
