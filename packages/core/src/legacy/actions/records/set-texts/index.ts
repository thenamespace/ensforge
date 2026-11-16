import { Effect } from "effect";

import {
  publicResolverV1MulticallAbi,
  publicResolverV1SetTextAbi,
  permissionedResolverV2SetTextAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import type { SetTextsParameters } from "./types.js";

export const setTexts = makeResolverWriteAction<SetTextsParameters>({
  operation: "setTexts",
  records: (parameters) =>
    parameters.texts.map((text) => ({ type: "text", key: text.key }) as const),
  encode: (parameters, context) =>
    Effect.try({
      try: () => {
        const calls = parameters.texts.map((text) =>
          encodeFunctionData({
            abi: context.permissioned
              ? permissionedResolverV2SetTextAbi
              : publicResolverV1SetTextAbi,
            functionName: "setText",
            args: [context.permissioned ? context.dnsName : context.node, text.key, text.value],
          }),
        );

        return encodeFunctionData({
          abi: publicResolverV1MulticallAbi,
          functionName: "multicall",
          args: [calls],
        });
      },
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode the setTexts call for ${context.name}`,
          cause,
        }),
    }),
});

export type {
  SetTextsError,
  SetTextsParameters,
  SetTextsResult,
  TextRecordInput,
} from "./types.js";
