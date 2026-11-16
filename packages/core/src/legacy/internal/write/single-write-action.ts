import { Effect } from "effect";

import {
  defineWriteAction,
  makeWriteIntent,
  type EnsWriteAction,
  type EnsWriteIntentPreparer,
} from "../../action/write-intent.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import type { CallExecutionResult, WriteError } from "../../write/types.js";
import { executeSequential } from "./execute-sequential.js";

export const makeSingleWriteAction = <Parameters>(
  operation: string,
  preparer: EnsWriteIntentPreparer<Parameters, WriteError>,
  options?: { readonly sensitive?: boolean },
): EnsWriteAction<Parameters, CallExecutionResult, WriteError> => {
  const implementation = Effect.fn(`ensforge.${operation}`)(function* (
    config: EnsforgeConfig,
    parameters: Parameters,
  ) {
    const intent = makeWriteIntent<Parameters, CallExecutionResult, WriteError>(
      operation,
      parameters,
      preparer,
      options?.sensitive ?? false,
    );

    const result = yield* executeSequential(config, { calls: [intent] });
    const call = result.calls[0];

    if (call === undefined) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: `${operation} did not produce an execution result`,
        cause: result,
      });
    }

    return call;
  });

  return defineWriteAction(operation, implementation, preparer, options);
};
