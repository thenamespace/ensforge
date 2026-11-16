import { Effect } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { provideConfig } from "../../internal/config/context.js";
import { prepareWriteIntents } from "../../internal/write/prepare-write-intents.js";
import { redactSensitiveWriteError } from "../../internal/write/redact-sensitive-error.js";
import { simulatePreparedCalls } from "../../internal/write/simulate-prepared-calls.js";
import type { SimulatedWriteCall, SimulateCallsParameters, WriteError } from "../../write/types.js";

const simulateCallsEffect = Effect.fn("ensforge.simulateCalls")(function* (
  config: EnsforgeConfig,
  parameters: SimulateCallsParameters,
) {
  const calls = yield* prepareWriteIntents(config, parameters);

  yield* Effect.annotateCurrentSpan({
    "ens.network": config.network,
    "ens.write.call_count": calls.length,
    "ens.write.operation": "simulate",
  });

  return yield* provideConfig(config, simulatePreparedCalls(calls, config.reads.concurrency)).pipe(
    Effect.mapError((error) => redactSensitiveWriteError(parameters.calls, error)),
  );
});

export const simulateCalls = defineAction<
  SimulateCallsParameters,
  ReadonlyArray<SimulatedWriteCall>,
  WriteError
>(simulateCallsEffect);
