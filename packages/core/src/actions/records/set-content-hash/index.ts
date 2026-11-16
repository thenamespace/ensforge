import { Effect } from "effect";

import {
  publicResolverV1SetContenthashAbi,
  permissionedResolverV2SetContenthashAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { encodeContentHash } from "../../../names/content-hash.js";
import type { SetContentHashParameters } from "./types.js";

export const setContentHash = makeResolverWriteAction<SetContentHashParameters>({
  operation: "setContentHash",
  records: () => [{ type: "contentHash" }],
  encode: (parameters, context) =>
    Effect.try({
      try: () =>
        encodeFunctionData({
          abi: context.permissioned
            ? permissionedResolverV2SetContenthashAbi
            : publicResolverV1SetContenthashAbi,
          functionName: "setContenthash",
          args: [
            context.permissioned ? context.dnsName : context.node,
            encodeContentHash({ protocol: parameters.protocol, value: parameters.value }),
          ],
        }),
      catch: (cause) =>
        cause instanceof CodecError
          ? cause
          : new ContractError({
              code: "ENCODE_FAILED",
              message: `Unable to encode the setContentHash call for ${context.name}`,
              cause,
            }),
    }),
});

export type {
  SetContentHashError,
  SetContentHashParameters,
  SetContentHashResult,
} from "./types.js";
