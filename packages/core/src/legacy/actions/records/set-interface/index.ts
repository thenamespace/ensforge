import { Effect, Schema } from "effect";

import {
  publicResolverV1SetInterfaceAbi,
  permissionedResolverV2SetInterfaceAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { InterfaceId } from "../../../schemas/records.js";
import type { SetInterfaceParameters } from "./types.js";

export const setInterface = makeResolverWriteAction<SetInterfaceParameters>({
  operation: "setInterface",
  records: () => [{ type: "interface" }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      const interfaceId = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(InterfaceId)(parameters.interfaceId),
        catch: () =>
          new CodecError({
            code: "INVALID_INTERFACE_ID",
            message: `Invalid interface ID for ${context.name}`,
          }),
      });

      const implementer = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(EthereumAddress)(parameters.implementer),
        catch: () =>
          new CodecError({
            code: "INVALID_ADDRESS",
            message: `Invalid interface implementer for ${context.name}`,
          }),
      });

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: context.permissioned
              ? permissionedResolverV2SetInterfaceAbi
              : publicResolverV1SetInterfaceAbi,
            functionName: "setInterface",
            args: [context.permissioned ? context.dnsName : context.node, interfaceId, implementer],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setInterface call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetInterfaceError, SetInterfaceParameters, SetInterfaceResult } from "./types.js";
