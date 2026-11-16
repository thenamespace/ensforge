import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import { RpcError } from "../../errors/rpc-error.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  SendCallsParameters,
  SequentialCallsResult,
  WriteError,
} from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { prepareWriteIntents } from "./prepare-write-intents.js";
import { redactSensitiveWriteError } from "./redact-sensitive-error.js";
import { simulatePreparedCalls } from "./simulate-prepared-calls.js";
import { WriteClient } from "./write-client.js";

const notStarted = (id: string, operation: string): CallExecutionResult => ({
  id,
  operation,
  status: "not-started",
  hash: null,
  receipt: null,
});

export const executeSequential = Effect.fn("executeSequential")(function* (
  config: EnsforgeConfig,
  parameters: SendCallsParameters,
  startIndex = 0,
): Effect.fn.Return<SequentialCallsResult, WriteError> {
  const confirmation: ConfirmationPolicy = parameters.confirmation ?? config.writes.confirmation;
  const simulation = parameters.simulation ?? config.writes.simulation;
  const completed: Array<CallExecutionResult> = [];

  for (const [localIndex, intent] of parameters.calls.entries()) {
    const index = startIndex + localIndex;

    const execution = yield* Effect.result(
      Effect.gen(function* () {
        const singleCallParameters = {
          calls: [intent],
          ...(parameters.walletClient === undefined
            ? {}
            : { walletClient: parameters.walletClient }),
          ...(parameters.account === undefined ? {} : { account: parameters.account }),
        };

        const prepared = yield* prepareWriteIntents(config, singleCallParameters, "call", index);
        const call = prepared[0];

        if (call === undefined) {
          return yield* new WritePlanError({
            code: "INVALID_CALL_PLAN",
            message: "A single write intent did not produce a prepared call",
            cause: intent,
          });
        }

        if (simulation === "required") {
          yield* provideConfig(config, simulatePreparedCalls([call], 1));
        }

        const { walletClient } = yield* provideConfig(config, resolveWalletContext(parameters));
        const client = yield* provideConfig(config, WriteClient);
        const hash = yield* client.sendTransaction(walletClient, call);

        if (confirmation.type === "submitted") {
          return {
            call: {
              id: call.id,
              operation: call.operation,
              status: "submitted",
              hash,
              receipt: null,
            } satisfies CallExecutionResult,
            failure: null,
          } as const;
        }

        const confirmationResult = yield* Effect.result(
          client
            .waitForReceipt(hash, {
              ...(confirmation.confirmations === undefined
                ? {}
                : { confirmations: confirmation.confirmations }),
              ...(confirmation.timeout === undefined ? {} : { timeout: confirmation.timeout }),
            })
            .pipe(
              Effect.retry({
                times: config.writes.statusRetries,
                while: (error) => error instanceof RpcError,
              }),
            ),
        );

        if (Result.isFailure(confirmationResult)) {
          return {
            call: {
              id: call.id,
              operation: call.operation,
              status: "submitted",
              hash,
              receipt: null,
            } satisfies CallExecutionResult,
            failure: confirmationResult.failure,
          } as const;
        }

        const receipt = confirmationResult.success;

        return {
          call: {
            id: call.id,
            operation: call.operation,
            status: "confirmed",
            hash: receipt.transactionHash,
            receipt,
          } satisfies CallExecutionResult,
          failure: null,
        } as const;
      }).pipe(Effect.mapError((error) => redactSensitiveWriteError([intent], error))),
    );

    if (Result.isFailure(execution)) {
      const failure = execution.failure;

      if (completed.length === 0) return yield* failure;

      const remaining = parameters.calls
        .slice(localIndex)
        .map((remainingIntent, offset) =>
          notStarted(`call-${index + offset}`, remainingIntent.operation),
        );

      return {
        mode: "sequential",
        atomic: false,
        status: "partial",
        calls: [...completed, ...remaining],
        failure,
      };
    }

    const success = execution.success;

    completed.push(success.call);

    if (success.failure !== null) {
      const remaining = parameters.calls
        .slice(localIndex + 1)
        .map((remainingIntent, offset) =>
          notStarted(`call-${index + offset + 1}`, remainingIntent.operation),
        );

      return {
        mode: "sequential",
        atomic: false,
        status: "partial",
        calls: [...completed, ...remaining],
        failure: success.failure,
      };
    }
  }

  return {
    mode: "sequential",
    atomic: false,
    status: "completed",
    calls: completed,
    failure: null,
  };
});
