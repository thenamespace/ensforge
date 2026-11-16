import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";

import { loadFunding, type FundingContext } from "../context.js";
import { fundingStorage } from "../storage.js";
import type { RhinestoneCrossChain, RhinestoneFundingRecord } from "../types.js";

export const createCancelFunding = (
  context: FundingContext,
): RhinestoneCrossChain["cancelFunding"] =>
  defineAction((config, input) =>
    Effect.tryPromise({
      try: async () => {
        const record = await loadFunding(context, config, input);

        if (record.state === "cancelled") return record;
        if (record.state !== "authorizing")
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Submitted or uncertain funding cannot be cancelled locally",
          });

        const cancelled: RhinestoneFundingRecord = {
          ...record,
          state: "cancelled",
          revision: record.revision + 1,
        };

        if (
          !(await fundingStorage(input.storage ?? config.storage).compareAndSwap({
            id: record.id,
            expectedRevision: record.revision,
            operation: cancelled,
          }))
        )
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Funding changed concurrently; reload before cancelling",
          });

        return cancelled;
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "ADAPTER_FAILED",
              message: "Could not cancel local funding",
              cause,
            }),
    }),
  );
