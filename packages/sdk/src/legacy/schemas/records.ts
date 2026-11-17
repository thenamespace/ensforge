import { Predicate, Schema } from "effect";

import type { Abi as ViemAbi } from "viem";

import { Hex } from "./hex.js";

export const AddressRecordData = Hex.pipe(Schema.brand("AddressRecordData"));

export type AddressRecordData = typeof AddressRecordData.Type;

export const AbiRecordData = Hex.pipe(Schema.brand("AbiRecordData"));

export type AbiRecordData = typeof AbiRecordData.Type;

export const AbiContentType = Schema.Literals(["json", "zlib-json", "cbor", "uri"]);

export type AbiContentType = typeof AbiContentType.Type;

export const Abi = Schema.declare<ViemAbi>(
  (value): value is ViemAbi =>
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Predicate.isObject(entry) &&
        Predicate.hasProperty(entry, "type") &&
        Predicate.isString(entry.type),
    ),
  {
    identifier: "Abi",
    description: "An Ethereum JSON ABI",
  },
);

export type Abi = typeof Abi.Type;

export const InterfaceId = Hex.pipe(
  Schema.check(
    Schema.isPattern(/^0x[0-9a-fA-F]{8}$/, {
      message: "Expected a 4-byte interface ID",
    }),
  ),
  Schema.brand("InterfaceId"),
);

export type InterfaceId = typeof InterfaceId.Type;

export const ContentHash = Hex.pipe(Schema.brand("ContentHash"));

export type ContentHash = typeof ContentHash.Type;

export const ContentHashProtocol = Schema.Literals([
  "ipfs",
  "ipns",
  "swarm",
  "onion",
  "onion3",
  "skynet",
  "arweave",
  "adnl",
]);

export type ContentHashProtocol = typeof ContentHashProtocol.Type;
