import { Effect, Schema } from "effect";

import {
  publicResolverV1SetDataAbi,
  permissionedResolverV2SetDataAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { Hex } from "../../../schemas/hex.js";
import type { SetDataParameters } from "./types.js";

export const setData = makeResolverWriteAction<SetDataParameters>({
  operation: "setData",
  records: (parameters) => [{ type: "data", key: parameters.key }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      if (!Schema.is(Hex)(parameters.value)) {
        return yield* new CodecError({
          code: "INVALID_HEX",
          message: `Invalid data record value for ${context.name}`,
        });
      }

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: context.permissioned
              ? permissionedResolverV2SetDataAbi
              : publicResolverV1SetDataAbi,
            functionName: "setData",
            args: [
              context.permissioned ? context.dnsName : context.node,
              parameters.key,
              parameters.value,
            ],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setData call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetDataError, SetDataParameters, SetDataResult } from "./types.js";
