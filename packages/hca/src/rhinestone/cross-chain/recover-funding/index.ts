import { Effect, Schema } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";

import { loadFunding, type FundingContext } from "../context.js";
import { fundingStorage } from "../storage.js";
import type { RhinestoneCrossChain, RhinestoneFundingRecord } from "../types.js";

export const createRecoverFunding = (
  context: FundingContext,
): RhinestoneCrossChain["recoverFunding"] =>
  defineAction((config, input) =>
    Effect.tryPromise({
      try: async () => {
        const record = await loadFunding(context, config, input);
        const intentId = Schema.decodeUnknownSync(
          Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/)),
        )(input.intentId);

        if (record.intentId === intentId) return record;
        if (record.state !== "submitting" || record.intentId)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Only an uncertain submission can attach a recovered provider identifier",
          });

        const provider = await context.sdk.getIntentStatus(BigInt(intentId));

        if (
          provider.fill.chainId !== record.destinationChainId ||
          provider.claims.some((claim) => claim.chainId !== record.sourceChainId)
        )
          throw new HcaError({
            code: "INVALID_SUBMISSION",
            message: "Recovered intent belongs to another route",
          });

        const recovered: RhinestoneFundingRecord = {
          ...record,
          state: "submitted",
          intentId,
          revision: record.revision + 1,
        };

        if (
          !(await fundingStorage(input.storage ?? config.storage).compareAndSwap({
            id: record.id,
            expectedRevision: record.revision,
            operation: recovered,
          }))
        )
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Funding changed concurrently; reload before recovery",
          });

        return recovered;
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "ADAPTER_FAILED",
              message: "Could not recover funding identifier",
              cause,
            }),
    }),
  );
