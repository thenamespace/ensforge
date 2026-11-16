import { Effect, Schema } from "effect";

import { publicResolverV1SetPubkeyAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { Bytes32 } from "../../../schemas/hash.js";
import type { SetPubkeyParameters } from "./types.js";

export const setPubkey = makeResolverWriteAction<SetPubkeyParameters>({
  operation: "setPubkey",
  records: () => [{ type: "pubkey" }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      if (!Schema.is(Bytes32)(parameters.x) || !Schema.is(Bytes32)(parameters.y)) {
        return yield* new CodecError({
          code: "INVALID_HEX",
          message: `Invalid public key coordinates for ${context.name}`,
        });
      }

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: publicResolverV1SetPubkeyAbi,
            functionName: "setPubkey",
            args: [context.node, parameters.x, parameters.y],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setPubkey call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetPubkeyError, SetPubkeyParameters, SetPubkeyResult } from "./types.js";
