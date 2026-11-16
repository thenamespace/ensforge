import { Clock, Effect, Option, Schema, Stream } from "effect";

import { getHcaExecutionStatus } from "../../actions/hca/get-hca-execution-status/index.js";
import type { HcaExecutionStatus, WaitForHcaExecutionParameters } from "../../actions/hca/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import type { WriteError } from "../../write/types.js";
import { hcaRpc } from "./context.js";

const positive = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0));

export const resolveHcaWaitOptions = (
  config: EnsforgeConfig,
  parameters: WaitForHcaExecutionParameters,
) => {
  const policy = config.writes.confirmation;

  const timeout =
    parameters.timeout ?? (policy.type === "confirmed" ? policy.timeout : undefined) ?? 120_000;

  const confirmations =
    parameters.confirmations ??
    (policy.type === "confirmed" ? policy.confirmations : undefined) ??
    1;

  const pollingInterval = parameters.pollingInterval ?? 1_000;
  const maxPollingInterval = parameters.maxPollingInterval ?? Math.max(pollingInterval, 10_000);

  if (
    ![timeout, confirmations, pollingInterval, maxPollingInterval].every(Schema.is(positive)) ||
    !Number.isInteger(confirmations) ||
    maxPollingInterval < pollingInterval
  )
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message:
        "Wait options must be positive, confirmations integral, and maximum interval at least the initial interval",
    });

  return { timeout, confirmations, pollingInterval, maxPollingInterval };
};

export const hcaExecutionTimeout = () =>
  new HcaError({
    code: "INVALID_EXECUTION",
    message: "Execution wait timed out; retain the submission handle to resume",
  });

export const hcaExecutionStream = (
  config: EnsforgeConfig,
  parameters: WaitForHcaExecutionParameters,
): Stream.Stream<HcaExecutionStatus, WriteError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const options = yield* Effect.try({
        try: () => resolveHcaWaitOptions(config, parameters),
        catch: (cause) => cause as HcaError,
      });

      const deadline = (yield* Clock.currentTimeMillis) + options.timeout;

      const poll = Effect.fn("ensforge.watchHcaExecution.poll")(function* (attempt: number) {
        const remaining = deadline - (yield* Clock.currentTimeMillis);

        if (remaining <= 0) return yield* hcaExecutionTimeout();

        return yield* Effect.gen(function* () {
          if (attempt > 0)
            yield* Effect.sleep(
              Math.min(
                options.pollingInterval * 2 ** Math.min(attempt - 1, 20),
                options.maxPollingInterval,
              ),
            );

          let status = yield* getHcaExecutionStatus.effect(config, parameters);

          if (status.status === "succeeded" || status.status === "failed") {
            const head = yield* hcaRpc(() => config.publicClient.getBlockNumber({ cacheTime: 0 }));

            for (const receipt of status.receipts) {
              // Reconcile destination receipts against the current chain before claiming finality.
              const canonical = yield* hcaRpc(() =>
                config.publicClient.getTransactionReceipt({ hash: receipt.transactionHash }),
              );

              const block = yield* hcaRpc(() =>
                config.publicClient.getBlock({ blockNumber: receipt.blockNumber }),
              );

              if (
                canonical.blockHash !== receipt.blockHash ||
                canonical.status !== receipt.status ||
                block.hash !== receipt.blockHash ||
                head < receipt.blockNumber + BigInt(options.confirmations - 1)
              ) {
                status = { status: "pending", submission: status.submission };

                break;
              }
            }
          }

          return [
            [status],
            status.status === "succeeded" ||
            status.status === "failed" ||
            status.status === "cancelled" ||
            status.status === "expired"
              ? Option.none<number>()
              : Option.some(attempt + 1),
          ] as const;
        }).pipe(
          Effect.timeout(remaining),
          Effect.catchTag("TimeoutError", () => hcaExecutionTimeout()),
        );
      });

      return Stream.paginate(0, poll);
    }),
  );
