import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import { RpcError } from "../../errors/rpc-error.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  SequentialCallsResult,
} from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { WriteClient } from "./write-client.js";

export const resumeSequentialConfirmations = Effect.fn("resumeSequentialConfirmations")(function* (
  config: EnsforgeConfig,
  previous: SequentialCallsResult,
  confirmation: ConfirmationPolicy,
) {
  if (confirmation.type === "submitted") return previous;

  const client = yield* provideConfig(config, WriteClient);
  const calls: Array<CallExecutionResult> = [];

  for (const call of previous.calls) {
    if (call.status !== "submitted") {
      calls.push(call);

      continue;
    }

    if (call.hash === null) {
      return {
        ...previous,
        calls: [...calls, call, ...previous.calls.slice(calls.length + 1)],
        failure: new WritePlanError({
          code: "INVALID_CALL_PLAN",
          message: `Submitted call ${call.id} does not include a transaction hash`,
          cause: call,
        }),
      } satisfies SequentialCallsResult;
    }

    const receipt = yield* Effect.result(
      client
        .waitForReceipt(call.hash, {
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

    if (Result.isFailure(receipt)) {
      return {
        ...previous,
        calls: [...calls, call, ...previous.calls.slice(calls.length + 1)],
        failure: receipt.failure,
      } satisfies SequentialCallsResult;
    }

    calls.push({
      ...call,
      status: "confirmed",
      hash: receipt.success.transactionHash,
      receipt: receipt.success,
    });
  }

  return { ...previous, calls, failure: null } satisfies SequentialCallsResult;
});
