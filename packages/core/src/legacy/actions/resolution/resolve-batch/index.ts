import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { executeResolveCall } from "../resolve/execute.js";
import type { ResolveBatchError, ResolveBatchParameters, ResolveBatchResult } from "./types.js";

const resolveBatchEffect = Effect.fn("ensforge.resolveBatch")(function* (
  config: EnsforgeConfig,
  parameters: ResolveBatchParameters,
) {
  if (parameters.calls.length === 0) return [];

  return yield* executeRead(
    config,
    parameters,
    Effect.forEach(parameters.calls, (call) => executeResolveCall(call, config.gateways), {
      concurrency: config.reads.concurrency,
    }),
  );
});

export const resolveBatch = defineReadAction<
  ResolveBatchParameters,
  ResolveBatchResult,
  ResolveBatchError
>(resolveBatchEffect);

export {
  type ResolveBatchCall,
  type ResolveBatchError,
  type ResolveBatchParameters,
  type ResolveBatchResult,
} from "./types.js";
