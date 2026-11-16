import { Effect, Predicate, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";
import { type Address, type Hex } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { Hex as HexSchema } from "../../../schemas/hex.js";
import { HcaExecutionHash } from "../execution-contract.js";
import { type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const verifyHcaSignature = defineReadAction<
  HcaReadParameters & { readonly hash: Hex; readonly signature: Hex; readonly sender?: Address },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);

      if (
        !Schema.is(HcaExecutionHash)(parameters.hash) ||
        !Schema.is(HexSchema)(parameters.signature)
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Expected a bytes32 hash and hex signature",
        });

      if (parameters.sender !== undefined) yield* validateHcaAddress(parameters.sender);

      const result = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "isValidSignature",
          args: [parameters.hash, parameters.signature],
          ...(parameters.sender === undefined ? {} : { account: parameters.sender }),
          blockNumber,
        }),
      ).pipe(
        Effect.catch((error) => {
          // Client errors can come from a different installed copy of viem.
          let cause: unknown = error.cause;
          while (Predicate.isError(cause)) {
            if (cause.name === "ContractFunctionRevertedError") {
              return Effect.succeed("0xffffffff" as const);
            }
            cause = cause.cause;
          }

          return Effect.fail(error);
        }),
      );

      return result === "0x1626ba7e";
    }),
  ),
);
