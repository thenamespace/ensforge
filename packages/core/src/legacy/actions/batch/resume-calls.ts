import { Effect } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { provideConfig } from "../../internal/config/context.js";
import { resolveWalletContext } from "../../internal/services/wallet-client.js";
import { confirmNativeBatch } from "../../internal/write/confirm-native-batch.js";
import type { NativeBatchResult, ResumeCallsParameters, WriteError } from "../../write/types.js";

const resumeCallsEffect = Effect.fn("ensforge.resumeCalls")(function* (
  config: EnsforgeConfig,
  parameters: ResumeCallsParameters,
) {
  if (parameters.batch.status === "confirmed") return parameters.batch;

  const { walletClient } = yield* provideConfig(config, resolveWalletContext(parameters));

  return yield* provideConfig(
    config,
    confirmNativeBatch(
      config,
      walletClient,
      parameters.batch.id,
      parameters.batch.calls,
      parameters.batch.capabilities,
      parameters.confirmation ?? config.writes.confirmation,
      parameters.batch.atomic,
    ),
  );
});

export const resumeCalls = defineAction<ResumeCallsParameters, NativeBatchResult, WriteError>(
  resumeCallsEffect,
);
