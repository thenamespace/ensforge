import { Effect, Schema } from "effect";

import { publicResolverV1SetZonehashAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { Hex } from "../../../schemas/hex.js";
import type { SetZoneHashParameters } from "./types.js";

export const setZoneHash = makeResolverWriteAction<SetZoneHashParameters>({
  operation: "setZoneHash",
  records: () => [{ type: "dnsZone" }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      if (!Schema.is(Hex)(parameters.value)) {
        return yield* new CodecError({
          code: "INVALID_HEX",
          message: `Invalid DNS zone hash for ${context.name}`,
        });
      }

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: publicResolverV1SetZonehashAbi,
            functionName: "setZonehash",
            args: [context.node, parameters.value],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setZoneHash call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetZoneHashError, SetZoneHashParameters, SetZoneHashResult } from "./types.js";
