import { Effect } from "effect";

import {
  publicResolverV1SetTextAbi,
  permissionedResolverV2SetTextAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import {
  type ResolverWriteEncodingContext,
  makeResolverWriteAction,
} from "../../../internal/write/resolver-write-action.js";
import type { ClearAvatarParameters, SetAvatarParameters } from "./types.js";

const encodeAvatar = (context: ResolverWriteEncodingContext, value: string) =>
  Effect.try({
    try: () =>
      encodeFunctionData({
        abi: context.permissioned ? permissionedResolverV2SetTextAbi : publicResolverV1SetTextAbi,
        functionName: "setText",
        args: [context.permissioned ? context.dnsName : context.node, "avatar", value],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the avatar write for ${context.name}`,
        cause,
      }),
  });

export const setAvatar = makeResolverWriteAction<SetAvatarParameters>({
  operation: "setAvatar",
  records: () => [{ type: "text", key: "avatar" }],
  encode: (parameters, context) => encodeAvatar(context, parameters.value),
});

export const clearAvatar = makeResolverWriteAction<ClearAvatarParameters>({
  operation: "clearAvatar",
  records: () => [{ type: "text", key: "avatar" }],
  encode: (_parameters, context) => encodeAvatar(context, ""),
});

export type {
  ClearAvatarError,
  ClearAvatarParameters,
  ClearAvatarResult,
  SetAvatarError,
  SetAvatarParameters,
  SetAvatarResult,
} from "./types.js";
