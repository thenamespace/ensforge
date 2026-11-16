import { Effect, Schema } from "effect";

import {
  publicResolverV1SetABIAbi,
  permissionedResolverV2SetABIAbi,
} from "@ensforge/contracts/internal";
import { encode as encodeCbor } from "cborg";
import { zlibSync } from "fflate";
import { bytesToHex, encodeFunctionData, stringToBytes, stringToHex } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeResolverWriteAction } from "../../../internal/write/resolver-write-action.js";
import { Abi } from "../../../schemas/records.js";
import type { SetAbiParameters } from "./types.js";

const contentTypeBits = {
  json: 1n,
  "zlib-json": 2n,
  cbor: 4n,
  uri: 8n,
} as const;

const encodeAbiValue = (parameters: SetAbiParameters) => {
  if (parameters.contentType === "uri") return stringToHex(parameters.value);

  const abi = parameters.value;

  if (parameters.contentType === "cbor") return bytesToHex(encodeCbor(abi));

  const json = JSON.stringify(abi);

  return parameters.contentType === "json"
    ? stringToHex(json)
    : bytesToHex(zlibSync(stringToBytes(json)));
};

export const setAbi = makeResolverWriteAction<SetAbiParameters>({
  operation: "setAbi",
  records: (parameters) => [{ type: "abi", contentType: contentTypeBits[parameters.contentType] }],
  encode: (parameters, context) =>
    Effect.gen(function* () {
      if (parameters.contentType !== "uri" && !Schema.is(Abi)(parameters.value)) {
        return yield* new CodecError({
          code: "INVALID_ABI",
          message: "Invalid ENS ABI record",
        });
      }

      return yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: context.permissioned ? permissionedResolverV2SetABIAbi : publicResolverV1SetABIAbi,
            functionName: "setABI",
            args: [
              context.permissioned ? context.dnsName : context.node,
              contentTypeBits[parameters.contentType],
              encodeAbiValue(parameters),
            ],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the setAbi call for ${context.name}`,
            cause,
          }),
      });
    }),
});

export type { SetAbiError, SetAbiParameters, SetAbiResult } from "./types.js";
