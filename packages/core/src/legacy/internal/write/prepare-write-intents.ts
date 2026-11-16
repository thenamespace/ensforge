import { Effect } from "effect";

import { getWriteIntentPreparer } from "../../action/write-intent.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import type { PreparedWriteCall, PrepareCallsParameters, WriteError } from "../../write/types.js";
import { executeRead } from "../read/execute-read.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { redactSensitiveWriteError } from "./redact-sensitive-error.js";

export const prepareWriteIntents = Effect.fn("prepareWriteIntents")(function* (
  config: EnsforgeConfig,
  parameters: PrepareCallsParameters,
  idPrefix = "call",
  startIndex = 0,
): Effect.fn.Return<ReadonlyArray<PreparedWriteCall>, WriteError> {
  if (parameters.calls.length === 0) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "A write call plan must contain at least one call",
      cause: parameters.calls,
    });
  }

  return yield* executeRead(
    config,
    { consistency: "snapshot" },
    Effect.gen(function* () {
      const { walletClient, account } = yield* resolveWalletContext(parameters);

      return yield* Effect.forEach(parameters.calls, (intent, localIndex) => {
        const index = startIndex + localIndex;
        const preparer = getWriteIntentPreparer(intent);

        if (preparer === undefined) {
          return new WritePlanError({
            code: "INTENT_NOT_PREPARABLE",
            message: `Write operation ${intent.operation} does not provide a call preparer`,
            cause: intent,
          });
        }

        const id = `${idPrefix}-${index}`;

        return preparer(config, intent.parameters, {
          id,
          index,
          account,
          chainId: config.chainId,
          walletClient,
        }).pipe(
          Effect.mapError((error) => redactSensitiveWriteError([intent], error)),
          Effect.map((details): PreparedWriteCall => {
            const call = {
              id,
              operation: intent.operation,
              account,
              chainId: config.chainId,
              to: details.to,
              value: details.value,
            };

            return Object.assign(
              call,
              details.data === undefined ? {} : { data: details.data },
              details.protocol === undefined ? {} : { protocol: details.protocol },
            );
          }),
        );
      });
    }),
  );
});
