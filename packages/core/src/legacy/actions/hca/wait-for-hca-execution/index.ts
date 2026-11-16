import { Effect, Option, Stream } from "effect";

import { defineAction } from "../../../action/action.js";
import { hcaExecutionStream, hcaExecutionTimeout } from "../../../internal/hca/tracking.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaExecutionStatus, WaitForHcaExecutionParameters } from "../types.js";

export const waitForHcaExecution = defineAction<
  WaitForHcaExecutionParameters,
  HcaExecutionStatus,
  WriteError
>(
  Effect.fn("ensforge.waitForHcaExecution")(function* (config, parameters) {
    const result = yield* Stream.runLast(hcaExecutionStream(config, parameters));

    if (Option.isNone(result)) return yield* hcaExecutionTimeout();

    return result.value;
  }),
);
