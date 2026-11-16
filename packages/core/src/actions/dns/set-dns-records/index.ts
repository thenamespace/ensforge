import { Effect, Schema } from "effect";

import { publicResolverV1SetDNSRecordsAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { Hex } from "../../../schemas/hex.js";
import type { SetDnsRecordsParameters } from "./types.js";

export const setDnsRecords = makeResolverWriteAction<SetDnsRecordsParameters>({
  operation: "setDnsRecords",
  records: () => [{ type: "dnsRecord" }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      if (!Schema.is(Hex)(parameters.data)) {
        return yield* new CodecError({
          code: "INVALID_HEX",
          message: `Invalid DNS record wire data for ${context.name}`,
        });
      }

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: publicResolverV1SetDNSRecordsAbi,
            functionName: "setDNSRecords",
            args: [context.node, parameters.data],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setDnsRecords call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetDnsRecordsError, SetDnsRecordsParameters, SetDnsRecordsResult } from "./types.js";
