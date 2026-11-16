import { Predicate, Schema } from "effect";

import type { IndexedRecordEvent } from "../../../actions/indexer/models/record.js";
import type { EnsNetworkId } from "../../../config/network.js";
import type { Namehash } from "../../../schemas/hash.js";
import type { V1GetRecordHistoryQuery } from "../generated/v1/get-record-history.js";
import type { V2GetRecordHistoryQuery } from "../generated/v2/get-record-history.js";
import { decodeAddress, decodeBigInt, decodeHex } from "./scalars.js";

type V1RecordEvent = V1GetRecordHistoryQuery["resolverEvents"][number];

type V2RecordEvent = V2GetRecordHistoryQuery["eventConnection"]["edges"][number]["node"];

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

const parseData = (data: string | null): Readonly<Record<string, unknown>> =>
  data === null ? {} : Schema.decodeUnknownSync(JsonObject)(JSON.parse(data));

const stringField = (record: Readonly<Record<string, unknown>>, field: string) =>
  Schema.decodeUnknownSync(Schema.String)(record[field]);

const booleanField = (record: Readonly<Record<string, unknown>>, field: string) =>
  Schema.decodeUnknownSync(Schema.Boolean)(record[field]);

const bigintField = (record: Readonly<Record<string, unknown>>, field: string) => {
  const value = record[field];

  return Predicate.isNumber(value) ? BigInt(value) : decodeBigInt(value);
};

const eventBase = (
  network: EnsNetworkId,
  protocol: "v1" | "v2",
  indexedBlock: bigint,
  namehash: Namehash,
  event: {
    readonly id: string;
    readonly blockNumber: number;
    readonly transactionHash: string | null;
    readonly resolver: string;
    readonly timestamp: number | null;
    readonly type: string;
    readonly data: string | null;
  },
) => ({
  id: event.id,
  namehash,
  source: { network, protocol, indexedBlock },
  resolver: decodeAddress(event.resolver),
  blockNumber: BigInt(event.blockNumber),
  timestamp: event.timestamp === null ? null : BigInt(event.timestamp),
  transactionHash: event.transactionHash === null ? null : decodeHex(event.transactionHash),
  logIndex: null,
  raw: { type: event.type, data: event.data },
});

export const normalizeV1RecordEvent = (
  event: V1RecordEvent,
  context: {
    readonly network: EnsNetworkId;
    readonly indexedBlock: bigint;
    readonly namehash: Namehash;
  },
): IndexedRecordEvent => {
  const common = eventBase(context.network, "v1", context.indexedBlock, context.namehash, {
    id: event.id,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionID,
    resolver: event.resolver.address,
    timestamp: null,
    type: event["__typename"],
    data: null,
  });

  switch (event["__typename"]) {
    case "AddrChanged":
      return { ...common, kind: "address", coinType: 60n, value: decodeHex(event.addr.id) };
    case "MulticoinAddrChanged":
      return {
        ...common,
        kind: "address",
        coinType: decodeBigInt(event.coinType),
        value: decodeHex(event.multicoinAddress),
      };
    case "TextChanged":
      return { ...common, kind: "text", key: event.key, value: event.value };
    case "ContenthashChanged":
      return { ...common, kind: "contenthash", value: decodeHex(event.hash) };
    case "AbiChanged":
      return { ...common, kind: "abi", contentType: decodeBigInt(event.contentType) };
    case "PubkeyChanged":
      return { ...common, kind: "pubkey", x: decodeHex(event.x), y: decodeHex(event.y) };
    case "InterfaceChanged":
      return {
        ...common,
        kind: "interface",
        interfaceId: decodeHex(event.interfaceID),
        implementer: decodeAddress(event.implementer),
      };
    case "NameChanged":
      return { ...common, kind: "reverse-name", name: event.name };
    case "AuthorisationChanged":
      return {
        ...common,
        kind: "authorization",
        owner: decodeAddress(event.owner),
        target: decodeAddress(event.target),
        authorized: event.isAuthorized,
      };
    case "VersionChanged":
      return { ...common, kind: "version", version: decodeBigInt(event.version) };
  }
};

export const normalizeV2RecordEvent = (
  event: V2RecordEvent,
  context: {
    readonly network: EnsNetworkId;
    readonly indexedBlock: bigint;
    readonly namehash: Namehash;
  },
): IndexedRecordEvent => {
  const protocol = event.protocol === "v1" ? "v1" : "v2";
  const payload = parseData(event.data);
  const resolver = Predicate.isString(payload.resolver) ? payload.resolver : event.contractAddress;

  const common = eventBase(context.network, protocol, context.indexedBlock, context.namehash, {
    id: event.id,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    resolver,
    timestamp: event.timestamp,
    type: event.type,
    data: event.data,
  });

  switch (event.type.toLowerCase()) {
    case "addressupdated":
    case "addresschanged":
    case "addrchanged":
    case "multicoinaddrchanged":
      return {
        ...common,
        kind: "address",
        coinType:
          event.asAddressChanged?.coinType === null ||
          event.asAddressChanged?.coinType === undefined
            ? bigintField(payload, "coinType")
            : BigInt(event.asAddressChanged.coinType),
        value: decodeHex(event.asAddressChanged?.address ?? stringField(payload, "address")),
      };
    case "textupdated":
    case "textchanged":
      return {
        ...common,
        kind: "text",
        key: event.asTextChanged?.key ?? event.key ?? stringField(payload, "key"),
        value:
          event.asTextChanged?.value ??
          event.value ??
          (Predicate.isString(payload.value) ? payload.value : null),
      };
    case "contenthashupdated":
    case "contenthashchanged":
      return {
        ...common,
        kind: "contenthash",
        value: decodeHex(
          Predicate.isString(payload.contentHash)
            ? payload.contentHash
            : stringField(payload, "hash"),
        ),
      };
    case "abiupdated":
    case "abichanged":
      return { ...common, kind: "abi", contentType: bigintField(payload, "contentType") };
    case "pubkeychanged":
      return {
        ...common,
        kind: "pubkey",
        x: decodeHex(stringField(payload, "x")),
        y: decodeHex(stringField(payload, "y")),
      };
    case "interfaceupdated":
    case "interfacechanged":
      return {
        ...common,
        kind: "interface",
        interfaceId: decodeHex(stringField(payload, "interfaceID")),
        implementer: decodeAddress(stringField(payload, "implementer")),
      };
    case "nameupdated":
    case "namechanged":
      return { ...common, kind: "reverse-name", name: stringField(payload, "name") };
    case "authorisationchanged":
    case "authorizationchanged":
      return {
        ...common,
        kind: "authorization",
        owner: decodeAddress(stringField(payload, "owner")),
        target: decodeAddress(stringField(payload, "target")),
        authorized: booleanField(payload, "isAuthorized"),
      };
    case "versionchanged":
      return { ...common, kind: "version", version: bigintField(payload, "version") };
    default:
      return { ...common, kind: "unknown", eventType: event.type };
  }
};
