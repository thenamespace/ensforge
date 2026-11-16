import { Effect, Result } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { RpcError } from "../../errors/rpc-error.js";
import { executeRead } from "../../internal/read/execute-read.js";
import { ReadContext } from "../../internal/read/execution-context.js";
import { prepareWriteIntents } from "../../internal/write/prepare-write-intents.js";
import { WriteClient } from "../../internal/write/write-client.js";
import type {
  CallEstimate,
  EstimateCallsParameters,
  EstimateCallsResult,
  FeeEstimate,
  WriteError,
} from "../../write/types.js";

const estimateCallsEffect = Effect.fn("ensforge.estimateCalls")(function* (
  config: EnsforgeConfig,
  parameters: EstimateCallsParameters,
) {
  return yield* executeRead(
    config,
    { consistency: "snapshot" },
    Effect.gen(function* () {
      const context = yield* ReadContext;

      if (context.block.blockNumber === undefined) {
        return yield* new RpcError({
          code: "REQUEST_FAILED",
          message: "Call estimation requires a concrete snapshot block",
          cause: context.block,
        });
      }

      const blockNumber = context.block.blockNumber;

      const calls = yield* prepareWriteIntents(config, parameters);

      yield* Effect.annotateCurrentSpan({
        "ens.network": config.network,
        "ens.write.call_count": calls.length,
        "ens.write.operation": "estimate",
      });

      const client = yield* WriteClient;
      const fee: FeeEstimate = yield* client.estimateFeesPerGas();
      const price = fee.type === "legacy" ? fee.gasPrice : fee.maxFeePerGas;

      const outcomes = yield* Effect.forEach(
        calls,
        (call) => Effect.result(client.estimateGas(call, blockNumber)),
        { concurrency: config.reads.concurrency },
      );

      const estimates = calls.map((call, index): CallEstimate => {
        const outcome = outcomes[index];

        if (outcome === undefined || Result.isFailure(outcome)) {
          return {
            status: "unavailable",
            call,
            error:
              outcome?.failure ??
              new RpcError({
                code: "REQUEST_FAILED",
                message: "Missing gas estimate result",
                cause: { index },
              }),
          };
        }

        const estimatedFee = outcome.success * price;

        return {
          status: "estimated",
          call,
          gas: outcome.success,
          fee: estimatedFee,
          value: call.value,
          maximumCost: call.value + estimatedFee,
        };
      });

      const successful = estimates.filter(
        (estimate): estimate is Extract<CallEstimate, { readonly status: "estimated" }> =>
          estimate.status === "estimated",
      );

      return {
        blockNumber,
        fee,
        calls: estimates,
        totals: {
          gas: successful.reduce((total, estimate) => total + estimate.gas, 0n),
          fee: successful.reduce((total, estimate) => total + estimate.fee, 0n),
          value: successful.reduce((total, estimate) => total + estimate.value, 0n),
          maximumCost: successful.reduce((total, estimate) => total + estimate.maximumCost, 0n),
        },
      } satisfies EstimateCallsResult;
    }),
  );
});

export const estimateCalls = defineAction<EstimateCallsParameters, EstimateCallsResult, WriteError>(
  estimateCallsEffect,
);
