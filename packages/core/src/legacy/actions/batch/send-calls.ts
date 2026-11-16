import { Effect } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { executeNativeBatch } from "../../internal/write/execute-native-batch.js";
import { executeSequential } from "../../internal/write/execute-sequential.js";
import { redactSensitiveWriteError } from "../../internal/write/redact-sensitive-error.js";
import type { SendCallsParameters, SendCallsResult, WriteError } from "../../write/types.js";
import { getWalletCapabilities, validateRequestedCapabilities } from "./get-wallet-capabilities.js";

const sendCallsEffect = Effect.fn("ensforge.sendCalls")(function* (
  config: EnsforgeConfig,
  parameters: SendCallsParameters,
) {
  const mode = parameters.mode ?? "auto";

  yield* Effect.annotateCurrentSpan({
    "ens.network": config.network,
    "ens.write.call_count": parameters.calls.length,
    "ens.write.mode": mode,
    "ens.write.atomicity": parameters.atomicity ?? "preferred",
  });

  if (mode === "sequential") return yield* executeSequential(config, parameters);

  const capabilities = yield* getWalletCapabilities.effect(config, parameters);
  const invalidCapabilities = validateRequestedCapabilities(parameters.capabilities, capabilities);

  if (invalidCapabilities !== undefined) return yield* invalidCapabilities;

  if (mode === "auto" && !capabilities.nativeCalls) {
    return yield* executeSequential(config, parameters);
  }

  return yield* executeNativeBatch(config, parameters, capabilities).pipe(
    Effect.mapError((error) => redactSensitiveWriteError(parameters.calls, error)),
  );
});

export const sendCalls = defineAction<SendCallsParameters, SendCallsResult, WriteError>(
  sendCallsEffect,
);
