import { Effect, Schema } from "effect";

import {
  abiResolverAbi,
  addressResolverAbi,
  addrResolverAbi,
  contenthashResolverAbi,
  dataResolverAbi,
  interfaceResolverAbi,
  nameResolverAbi,
  pubkeyResolverAbi,
  textResolverAbi,
} from "@ensforge/contracts/shared";
import { decode as decodeCbor } from "cborg";
import { strFromU8, unzlibSync } from "fflate";
import {
  bytesToString,
  decodeFunctionResult,
  encodeFunctionData,
  hexToBytes,
  zeroAddress,
  zeroHash,
  type AssetGatewayUrls,
  type Hex as ViemHex,
  type PublicClient,
} from "viem";

import type { ResolvedGatewayOptions } from "../../../config/gateway-options.js";
import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import type { EnsforgeServices } from "../../../internal/services/context.js";
import { decodeAddressRecord } from "../../../names/address-record.js";
import { parseCoinType } from "../../../names/coin-type.js";
import { decodeContentHash } from "../../../names/content-hash.js";
import { namehash } from "../../../names/hashes.js";
import type { CoinType } from "../../../schemas/coin-type.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { NormalizedName } from "../../../schemas/name.js";
import {
  Abi,
  AbiRecordData,
  AddressRecordData,
  ContentHash,
  InterfaceId,
  type AbiContentType,
} from "../../../schemas/records.js";
import { resolveAvatarRecord } from "../get-avatar/resolve.js";
import type { GetRecordsError, GetRecordsResult, GetRecordsSelection } from "./types.js";

const defaultAbiContentTypes = ["json", "zlib-json", "cbor", "uri"] as const;

const abiContentTypeBits = {
  json: 1n,
  "zlib-json": 2n,
  cbor: 4n,
  uri: 8n,
} as const satisfies Record<AbiContentType, bigint>;

const abiContentTypesByBit = new Map<bigint, AbiContentType>([
  [1n, "json"],
  [2n, "zlib-json"],
  [4n, "cbor"],
  [8n, "uri"],
]);

type Descriptor =
  | { readonly kind: "address"; readonly coinType: CoinType; readonly call: ViemHex }
  | { readonly kind: "text"; readonly key: string; readonly call: ViemHex }
  | { readonly kind: "avatar"; readonly call: ViemHex }
  | { readonly kind: "contentHash"; readonly call: ViemHex }
  | {
      readonly kind: "abi";
      readonly contentTypes: ReadonlyArray<AbiContentType>;
      readonly call: ViemHex;
    }
  | { readonly kind: "pubkey"; readonly call: ViemHex }
  | { readonly kind: "name"; readonly call: ViemHex }
  | { readonly kind: "interface"; readonly interfaceId: ViemHex; readonly call: ViemHex }
  | { readonly kind: "data"; readonly key: string; readonly call: ViemHex };

type MutableResult = {
  name: NormalizedName;
  addresses?: Array<unknown>;
  texts?: Array<unknown>;
  avatar?: unknown;
  contentHash?: unknown;
  abi?: unknown;
  pubkey?: unknown;
  nameRecord?: unknown;
  interfaces?: Array<unknown>;
  data?: Array<unknown>;
};

const encodeRecordCall = (label: string, encode: () => ViemHex) =>
  Effect.try({
    try: encode,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the ENS ${label} resolver call`,
        cause,
      }),
  });

const prepareDescriptors = Effect.fn("prepareRecordDescriptors")(function* (
  name: NormalizedName,
  selection: GetRecordsSelection,
) {
  const node = namehash(name);
  const descriptors: Array<Descriptor> = [];

  for (const input of selection.addresses ?? []) {
    const coinType = yield* Effect.try({
      try: () => parseCoinType(input),
      catch: (cause) =>
        cause instanceof CodecError
          ? cause
          : new CodecError({
              code: "INVALID_COIN_TYPE",
              message: `Invalid ENS coin type: ${input}`,
            }),
    });

    const call = yield* encodeRecordCall("address", () =>
      coinType === 60n
        ? encodeFunctionData({ abi: addrResolverAbi, functionName: "addr", args: [node] })
        : encodeFunctionData({
            abi: addressResolverAbi,
            functionName: "addr",
            args: [node, coinType],
          }),
    );

    descriptors.push({ kind: "address", coinType, call });
  }

  for (const key of selection.texts ?? []) {
    const call = yield* encodeRecordCall("text", () =>
      encodeFunctionData({ abi: textResolverAbi, functionName: "text", args: [node, key] }),
    );

    descriptors.push({ kind: "text", key, call });
  }

  if (selection.avatar === true) {
    const call = yield* encodeRecordCall("avatar text", () =>
      encodeFunctionData({
        abi: textResolverAbi,
        functionName: "text",
        args: [node, "avatar"],
      }),
    );

    descriptors.push({ kind: "avatar", call });
  }

  if (selection.contentHash === true) {
    const call = yield* encodeRecordCall("content hash", () =>
      encodeFunctionData({
        abi: contenthashResolverAbi,
        functionName: "contenthash",
        args: [node],
      }),
    );

    descriptors.push({ kind: "contentHash", call });
  }

  if (selection.abi !== undefined && selection.abi !== false) {
    const contentTypes =
      selection.abi === true
        ? defaultAbiContentTypes
        : (selection.abi.contentTypes ?? defaultAbiContentTypes);

    const mask = Array.from(new Set(contentTypes)).reduce(
      (value, contentType) => value | abiContentTypeBits[contentType],
      0n,
    );

    const call = yield* encodeRecordCall("ABI", () =>
      encodeFunctionData({ abi: abiResolverAbi, functionName: "ABI", args: [node, mask] }),
    );

    descriptors.push({ kind: "abi", contentTypes, call });
  }

  if (selection.pubkey === true) {
    const call = yield* encodeRecordCall("public key", () =>
      encodeFunctionData({ abi: pubkeyResolverAbi, functionName: "pubkey", args: [node] }),
    );

    descriptors.push({ kind: "pubkey", call });
  }

  if (selection.name === true) {
    const call = yield* encodeRecordCall("name", () =>
      encodeFunctionData({ abi: nameResolverAbi, functionName: "name", args: [node] }),
    );

    descriptors.push({ kind: "name", call });
  }

  for (const input of selection.interfaces ?? []) {
    const interfaceId = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(InterfaceId)(input),
      catch: () =>
        new CodecError({
          code: "INVALID_INTERFACE_ID",
          message: `Invalid EIP-165 interface ID: ${input}`,
        }),
    });

    const call = yield* encodeRecordCall("interface", () =>
      encodeFunctionData({
        abi: interfaceResolverAbi,
        functionName: "interfaceImplementer",
        args: [node, interfaceId],
      }),
    );

    descriptors.push({ kind: "interface", interfaceId, call });
  }

  for (const key of selection.data ?? []) {
    const call = yield* encodeRecordCall("data", () =>
      encodeFunctionData({ abi: dataResolverAbi, functionName: "data", args: [node, key] }),
    );

    descriptors.push({ kind: "data", key, call });
  }

  return descriptors;
});

const decodeAbiValue = (contentType: Exclude<AbiContentType, "uri">, raw: ViemHex) => {
  const bytes = hexToBytes(raw);

  const value =
    contentType === "json"
      ? JSON.parse(bytesToString(bytes))
      : contentType === "zlib-json"
        ? JSON.parse(strFromU8(unzlibSync(bytes)))
        : decodeCbor(bytes);

  return Schema.decodeUnknownSync(Abi)(value);
};

const decodeDescriptor = Effect.fn("decodeRecordDescriptor")(function* (
  descriptor: Descriptor,
  encoded: ViemHex | null,
) {
  if (encoded === null) {
    switch (descriptor.kind) {
      case "address":
        return {
          kind: "address",
          value: { coinType: descriptor.coinType, address: null, raw: null },
        } as const;
      case "text":
        return { kind: "text", value: { key: descriptor.key, value: null } } as const;
      case "avatar":
        return { kind: "avatar", value: null } as const;
      case "contentHash":
        return { kind: "contentHash", value: { protocol: null, value: null, raw: null } } as const;
      case "abi":
        return { kind: "abi", value: { contentType: null, value: null, raw: null } } as const;
      case "pubkey":
        return { kind: "pubkey", value: null } as const;
      case "name":
        return { kind: "name", value: { name: null } } as const;
      case "interface":
        return {
          kind: "interface",
          value: { interfaceId: descriptor.interfaceId, implementer: null },
        } as const;
      case "data":
        return { kind: "data", value: { key: descriptor.key, value: null } } as const;
    }
  }

  switch (descriptor.kind) {
    case "address": {
      const raw = yield* Effect.try({
        try: () =>
          Schema.decodeSync(AddressRecordData)(
            descriptor.coinType === 60n
              ? decodeFunctionResult({ abi: addrResolverAbi, functionName: "addr", data: encoded })
              : decodeFunctionResult({
                  abi: addressResolverAbi,
                  functionName: "addr",
                  data: encoded,
                }),
          ),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the address record for coin type ${descriptor.coinType}`,
            cause,
          }),
      });

      const address = yield* Effect.try({
        try: () => decodeAddressRecord({ coinType: descriptor.coinType, data: raw }),
        catch: (cause) =>
          cause instanceof CodecError
            ? cause
            : new CodecError({
                code: "INVALID_ADDRESS_RECORD",
                message: `Invalid encoded address for coin type ${descriptor.coinType}`,
              }),
      });

      return {
        kind: "address",
        value:
          address === null || (descriptor.coinType === 60n && address.toLowerCase() === zeroAddress)
            ? { coinType: descriptor.coinType, address: null, raw: null }
            : { coinType: descriptor.coinType, address, raw },
      } as const;
    }
    case "text": {
      const value = yield* Effect.try({
        try: () =>
          decodeFunctionResult({ abi: textResolverAbi, functionName: "text", data: encoded }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the text record for key ${descriptor.key}`,
            cause,
          }),
      });

      return {
        kind: "text",
        value: { key: descriptor.key, value: value.length === 0 ? null : value },
      } as const;
    }
    case "avatar": {
      const value = yield* Effect.try({
        try: () =>
          decodeFunctionResult({ abi: textResolverAbi, functionName: "text", data: encoded }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the avatar text record",
            cause,
          }),
      });

      return { kind: "avatar", value: value.length === 0 ? null : value } as const;
    }
    case "contentHash": {
      const raw = yield* Effect.try({
        try: () =>
          Schema.decodeSync(ContentHash)(
            decodeFunctionResult({
              abi: contenthashResolverAbi,
              functionName: "contenthash",
              data: encoded,
            }),
          ),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS content hash resolver result",
            cause,
          }),
      });

      const decoded = yield* Effect.try({
        try: () => decodeContentHash(raw),
        catch: (cause) =>
          cause instanceof CodecError
            ? cause
            : new CodecError({
                code: "INVALID_CONTENT_HASH",
                message: "Invalid encoded content hash",
              }),
      });

      return {
        kind: "contentHash",
        value: decoded === null ? { protocol: null, value: null, raw: null } : { ...decoded, raw },
      } as const;
    }
    case "abi": {
      const [contentTypeBit, encodedAbi] = yield* Effect.try({
        try: () =>
          decodeFunctionResult({ abi: abiResolverAbi, functionName: "ABI", data: encoded }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS ABI resolver result",
            cause,
          }),
      });

      if (contentTypeBit === 0n || encodedAbi === "0x") {
        return { kind: "abi", value: { contentType: null, value: null, raw: null } } as const;
      }

      const contentType = abiContentTypesByBit.get(contentTypeBit);

      if (contentType === undefined || !descriptor.contentTypes.includes(contentType)) {
        return yield* new CodecError({
          code: "UNSUPPORTED_ABI_CONTENT_TYPE",
          message: `Unsupported ENS ABI content type: ${contentTypeBit}`,
        });
      }

      const raw = yield* Effect.try({
        try: () => Schema.decodeSync(AbiRecordData)(encodedAbi),
        catch: () =>
          new CodecError({ code: "INVALID_ABI", message: `Invalid ${contentType} ENS ABI record` }),
      });

      if (contentType === "uri") {
        const value = yield* Effect.try({
          try: () => bytesToString(hexToBytes(raw)),
          catch: () =>
            new CodecError({ code: "INVALID_ABI", message: "Invalid URI ENS ABI record" }),
        });

        return { kind: "abi", value: { contentType, value, raw } } as const;
      }

      const value = yield* Effect.try({
        try: () => decodeAbiValue(contentType, raw),
        catch: () =>
          new CodecError({ code: "INVALID_ABI", message: `Invalid ${contentType} ENS ABI record` }),
      });

      return { kind: "abi", value: { contentType, value, raw } } as const;
    }
    case "pubkey": {
      const [encodedX, encodedY] = yield* Effect.try({
        try: () =>
          decodeFunctionResult({ abi: pubkeyResolverAbi, functionName: "pubkey", data: encoded }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS public key resolver result",
            cause,
          }),
      });

      if (encodedX === zeroHash && encodedY === zeroHash)
        return { kind: "pubkey", value: null } as const;

      const [x, y] = yield* Effect.try({
        try: () => [Schema.decodeSync(Hex)(encodedX), Schema.decodeSync(Hex)(encodedY)] as const,
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS public key coordinates",
            cause,
          }),
      });

      return { kind: "pubkey", value: { x, y } } as const;
    }
    case "name": {
      const value = yield* Effect.try({
        try: () =>
          decodeFunctionResult({ abi: nameResolverAbi, functionName: "name", data: encoded }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS name resolver result",
            cause,
          }),
      });

      return { kind: "name", value: { name: value.length === 0 ? null : value } } as const;
    }
    case "interface": {
      const implementer = yield* Effect.try({
        try: () =>
          Schema.decodeSync(EthereumAddress)(
            decodeFunctionResult({
              abi: interfaceResolverAbi,
              functionName: "interfaceImplementer",
              data: encoded,
            }),
          ),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: "Unable to decode the ENS interface resolver result",
            cause,
          }),
      });

      return {
        kind: "interface",
        value: {
          interfaceId: descriptor.interfaceId,
          implementer: implementer === zeroAddress ? null : implementer,
        },
      } as const;
    }
    case "data": {
      const value = yield* Effect.try({
        try: () =>
          Schema.decodeSync(Hex)(
            decodeFunctionResult({ abi: dataResolverAbi, functionName: "data", data: encoded }),
          ),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the ENS data record for key ${descriptor.key}`,
            cause,
          }),
      });

      return {
        kind: "data",
        value: { key: descriptor.key, value: value === "0x" ? null : value },
      } as const;
    }
  }
});

export const resolveSelectedRecords: (
  client: PublicClient,
  name: NormalizedName,
  selection: GetRecordsSelection,
  chainId: number,
  gatewayPolicy: ResolvedGatewayOptions,
  gatewayUrls?: AssetGatewayUrls,
) => Effect.Effect<GetRecordsResult, GetRecordsError, EnsforgeServices | ReadContext> = Effect.fn(
  "resolveSelectedRecords",
)(function* (client, name, selection, chainId, gatewayPolicy, gatewayUrls) {
  const descriptors = yield* prepareDescriptors(name, selection);

  const encodedResults = yield* resolveRecords(
    name,
    descriptors.map(({ call }) => call),
  );

  const decoded = yield* Effect.forEach(descriptors, (descriptor, index) =>
    decodeDescriptor(descriptor, encodedResults === null ? null : (encodedResults[index] ?? null)),
  );

  const result: MutableResult = { name };

  if (selection.addresses !== undefined) result.addresses = [];

  if (selection.texts !== undefined) result.texts = [];

  if (selection.avatar === true) result.avatar = null;

  if (selection.contentHash === true)
    result.contentHash = { protocol: null, value: null, raw: null };

  if (selection.abi !== undefined && selection.abi !== false)
    result.abi = { contentType: null, value: null, raw: null };

  if (selection.pubkey === true) result.pubkey = null;

  if (selection.name === true) result.nameRecord = { name: null };

  if (selection.interfaces !== undefined) result.interfaces = [];

  if (selection.data !== undefined) result.data = [];

  for (const record of decoded) {
    switch (record.kind) {
      case "address":
        result.addresses?.push(record.value);

        break;
      case "text":
        result.texts?.push(record.value);

        break;
      case "avatar":
        result.avatar =
          record.value === null
            ? null
            : yield* resolveAvatarRecord(
                client,
                name,
                record.value,
                chainId,
                gatewayPolicy,
                gatewayUrls,
              );

        break;
      case "contentHash":
        result.contentHash = record.value;

        break;
      case "abi":
        result.abi = record.value;

        break;
      case "pubkey":
        result.pubkey = record.value;

        break;
      case "name":
        result.nameRecord = record.value;

        break;
      case "interface":
        result.interfaces?.push(record.value);

        break;
      case "data":
        result.data?.push(record.value);

        break;
    }
  }

  return result as GetRecordsResult;
});
