import { Effect } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { TransactionError } from "../../errors/transaction-error.js";
import { provideConfig } from "../../internal/config/context.js";
import { resolveWalletContext } from "../../internal/services/wallet-client.js";
import { WriteClient } from "../../internal/write/write-client.js";
import type { CallsStatusResult, GetCallsStatusParameters, WriteError } from "../../write/types.js";

const getCallsStatusEffect = Effect.fn("ensforge.getCallsStatus")(function* (
  config: EnsforgeConfig,
  parameters: GetCallsStatusParameters,
) {
  return yield* provideConfig(
    config,
    Effect.gen(function* () {
      const { walletClient } = yield* resolveWalletContext(parameters);
      const client = yield* WriteClient;
      const status = yield* client.getCallsStatus(walletClient, parameters.id);

      if (status.chainId !== config.chainId) {
        return yield* new TransactionError({
          code: "INVALID_BATCH_STATUS",
          message: `Wallet call batch ${parameters.id} belongs to chain ${status.chainId}`,
          cause: status,
          batchId: parameters.id,
        });
      }

      return {
        id: parameters.id,
        chainId: status.chainId,
        status: status.status ?? "unknown",
        statusCode: status.statusCode,
        atomic: status.atomic,
        receipts: status.receipts ?? [],
      } satisfies CallsStatusResult;
    }),
  );
});

export const getCallsStatus = defineAction<GetCallsStatusParameters, CallsStatusResult, WriteError>(
  getCallsStatusEffect,
);
