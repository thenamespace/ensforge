import { Effect } from "effect";

import { publicResolverV1ClearRecordsAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import type { ClearRecordsParameters } from "./types.js";

export const clearRecords = makeResolverWriteAction<ClearRecordsParameters>({
  operation: "clearRecords",
  records: () => [{ type: "clear" }],
  encode: (_parameters, context) =>
    Effect.try({
      try: () =>
        encodeFunctionData({
          abi: publicResolverV1ClearRecordsAbi,
          functionName: "clearRecords",
          args: [context.node],
        }),
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode the clearRecords call for ${context.name}`,
          cause,
        }),
    }),
});

export type { ClearRecordsError, ClearRecordsParameters, ClearRecordsResult } from "./types.js";
