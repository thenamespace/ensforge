import { Clock, Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";

import type { RhinestoneCrossChain } from "../types.js";

export const createWaitForFunding = (
  getStatus: RhinestoneCrossChain["getFundingStatus"],
): RhinestoneCrossChain["waitForFunding"] =>
  defineAction(
    Effect.fn("ensforge.rhinestone.waitForFunding")(function* (config, input) {
      const timeout = input.timeoutMs ?? 120_000;
      const interval = input.pollingIntervalMs ?? 3_000;

      if (
        !Number.isSafeInteger(timeout) ||
        timeout < 0 ||
        timeout > 3_600_000 ||
        !Number.isSafeInteger(interval) ||
        interval < 100 ||
        interval > 60_000
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Invalid funding polling interval or timeout",
        });

      const started = yield* Clock.currentTimeMillis;

      while (true) {
        const status = yield* getStatus.effect(config, input);
        const elapsed = (yield* Clock.currentTimeMillis) - started;

        if (status.status === "funded" || status.status === "cancelled" || elapsed >= timeout)
          return status;

        yield* Effect.sleep(Math.min(interval, timeout - elapsed));
      }
    }),
  );
