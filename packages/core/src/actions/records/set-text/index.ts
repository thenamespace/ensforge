import { Effect } from "effect";

import {
  publicResolverV1SetTextAbi,
  permissionedResolverV2SetTextAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import type { SetTextParameters } from "./types.js";

export const setText = makeResolverWriteAction<SetTextParameters>({
  operation: "setText",
  records: (parameters) => [{ type: "text", key: parameters.key }],
  encode: (parameters, context) =>
    Effect.try({
      try: () =>
        encodeFunctionData({
          abi: context.permissioned ? permissionedResolverV2SetTextAbi : publicResolverV1SetTextAbi,
          functionName: "setText",
          args: [
            context.permissioned ? context.dnsName : context.node,
            parameters.key,
            parameters.value,
          ],
        }),
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode the setText call for ${context.name}`,
          cause,
        }),
    }),
});

export type { SetTextError, SetTextParameters, SetTextResult } from "./types.js";
