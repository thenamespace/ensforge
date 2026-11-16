import { Predicate, Schema } from "effect";

import { namehash as makeNamehash } from "viem/ens";

import type { IndexedEvent } from "../../../actions/indexer/models/event.js";
import type { IndexedRecordEvent } from "../../../actions/indexer/models/record.js";
import type { EnsNetworkId } from "../../../config/network.js";
import type { Namehash } from "../../../schemas/hash.js";
import type { V1GetEventsQuery } from "../generated/v1/get-events.js";
import type { V2GetEventsQuery } from "../generated/v2/get-events.js";
import { normalizeV2RecordEvent } from "./record-event.js";
import { decodeAddress, decodeBigInt, decodeDomainNamehash, decodeHex } from "./scalars.js";

type V1DomainEvent = V1GetEventsQuery["domainEvents"][number];

type V1RegistrationEvent = V1GetEventsQuery["registrationEvents"][number];

type V1ResolverEvent = V1GetEventsQuery["resolverEvents"][number];

type V2Event = V2GetEventsQuery["eventConnection"]["edges"][number]["node"];

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

const parseData = (data: string | null): Readonly<Record<string, unknown>> =>
  data === null ? {} : Schema.decodeUnknownSync(JsonObject)(JSON.parse(data));

const nullableAddress = (value: unknown) =>
  value === null || value === undefined ? null : decodeAddress(value);

const nullableBigInt = (value: unknown) =>
  value === null || value === undefined
    ? null
    : Predicate.isNumber(value)
      ? BigInt(value)
      : decodeBigInt(value);

const nullableHex = (value: unknown) =>
  value === null || value === undefined ? null : decodeHex(value);

const stringFrom = (payload: Readonly<Record<string, unknown>>, ...keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = payload[key];

    if (Predicate.isString(value)) return value;
  }

  return null;
};

const bigintFrom = (payload: Readonly<Record<string, unknown>>, ...keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = payload[key];

    if (Predicate.isNumber(value) || Predicate.isString(value)) return nullableBigInt(value);
  }

  return null;
};

const addressFrom = (payload: Readonly<Record<string, unknown>>, ...keys: ReadonlyArray<string>) =>
  nullableAddress(stringFrom(payload, ...keys));

const namehashFrom = (
  direct: unknown,
  name: string | null,
  payload: Readonly<Record<string, unknown>>,
): Namehash | null => {
  if (direct !== null && direct !== undefined) return decodeDomainNamehash(direct);

  if (name !== null) return decodeDomainNamehash(makeNamehash(name), name);

  const candidate = stringFrom(payload, "namehash", "node");

  return candidate === null ? null : decodeDomainNamehash(candidate);
};

const eventBase = (
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
  protocol: "v1" | "v2",
  event: {
    readonly id: string;
    readonly type: string;
    readonly name: string | null;
    readonly namehash: Namehash | null;
    readonly blockNumber: number;
    readonly timestamp: number | null;
    readonly transactionHash: unknown;
    readonly contractAddress: unknown;
    readonly data: string | null;
  },
) => ({
  id: event.id,
  protocol,
  name: event.name,
  namehash: event.namehash,
  blockNumber: BigInt(event.blockNumber),
  timestamp: event.timestamp === null ? null : BigInt(event.timestamp),
  transactionHash: nullableHex(event.transactionHash),
  logIndex: null,
  contractAddress: nullableAddress(event.contractAddress),
  source: { network: context.network, protocol, indexedBlock: context.indexedBlock },
  raw: { type: event.type, data: event.data },
});

const recordEvent = (
  common: ReturnType<typeof eventBase>,
  record: IndexedRecordEvent,
): IndexedEvent => ({
  ...common,
  kind: "record",
  recordKind: record.kind,
  key: record.kind === "text" ? record.key : null,
  coinType: record.kind === "address" ? record.coinType : null,
});

export const normalizeV1DomainEvent = (
  event: V1DomainEvent,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): IndexedEvent => {
  const common = eventBase(context, "v1", {
    id: event.id,
    type: event["__typename"],
    name: event.domain.name,
    namehash: decodeDomainNamehash(event.domain.id, event.domain.name),
    blockNumber: event.blockNumber,
    timestamp: null,
    transactionHash: event.transactionID,
    contractAddress: null,
    data: null,
  });

  switch (event["__typename"]) {
    case "Transfer":
    case "WrappedTransfer":
    case "NewOwner":
      return {
        ...common,
        kind: "transfer",
        from: null,
        to: decodeAddress(event.owner.id),
        tokenId: null,
      };
    case "NewResolver":
      return { ...common, kind: "resolver", resolver: decodeAddress(event.resolver.address) };
    case "NewTTL":
      return { ...common, kind: "ttl", ttl: decodeBigInt(event.ttl) };
    case "NameWrapped":
      return {
        ...common,
        kind: "wrap",
        owner: decodeAddress(event.owner.id),
        fuses: BigInt(event.fuses),
        expiry: decodeBigInt(event.expiryDate),
      };
    case "NameUnwrapped":
      return { ...common, kind: "unwrap", owner: decodeAddress(event.owner.id) };
    case "FusesSet":
      return { ...common, kind: "fuses", fuses: BigInt(event.fuses) };
    case "ExpiryExtended":
      return { ...common, kind: "expiry", expiry: decodeBigInt(event.expiryDate) };
  }
};

export const normalizeV1RegistrationEvent = (
  event: V1RegistrationEvent,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): IndexedEvent => {
  const name = event.registration.domain.name;

  const common = eventBase(context, "v1", {
    id: event.id,
    type: event["__typename"],
    name,
    namehash: decodeDomainNamehash(event.registration.domain.id, name),
    blockNumber: event.blockNumber,
    timestamp: null,
    transactionHash: event.transactionID,
    contractAddress: null,
    data: null,
  });

  switch (event["__typename"]) {
    case "NameRegistered":
      return {
        ...common,
        kind: "registration",
        registrationKind: "name",
        registrant: decodeAddress(event.registrant.id),
        expiry: decodeBigInt(event.expiryDate),
        cost: event.registration.cost === null ? null : decodeBigInt(event.registration.cost),
        baseCost: null,
        premium: null,
        referrer: null,
      };
    case "NameRenewed":
      return { ...common, kind: "renewal", expiry: decodeBigInt(event.expiryDate) };
    case "NameTransferred":
      return {
        ...common,
        kind: "transfer",
        from: null,
        to: decodeAddress(event.newOwner.id),
        tokenId: null,
      };
  }
};

export const normalizeV1ResolverEvent = (
  event: V1ResolverEvent,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): IndexedEvent => {
  const domain = event.resolver.domain;
  const name = domain?.name ?? null;

  const common = eventBase(context, "v1", {
    id: event.id,
    type: event["__typename"],
    name,
    namehash: domain === null ? null : decodeDomainNamehash(domain.id, name),
    blockNumber: event.blockNumber,
    timestamp: null,
    transactionHash: event.transactionID,
    contractAddress: event.resolver.address,
    data: null,
  });

  const recordKind =
    event["__typename"] === "AddrChanged" || event["__typename"] === "MulticoinAddrChanged"
      ? ("address" as const)
      : event["__typename"] === "TextChanged"
        ? ("text" as const)
        : event["__typename"] === "ContenthashChanged"
          ? ("contenthash" as const)
          : event["__typename"] === "AbiChanged"
            ? ("abi" as const)
            : event["__typename"] === "PubkeyChanged"
              ? ("pubkey" as const)
              : event["__typename"] === "InterfaceChanged"
                ? ("interface" as const)
                : event["__typename"] === "NameChanged"
                  ? ("reverse-name" as const)
                  : event["__typename"] === "AuthorisationChanged"
                    ? ("authorization" as const)
                    : ("version" as const);

  return {
    ...common,
    kind: "record",
    recordKind,
    key: event["__typename"] === "TextChanged" ? event.key : null,
    coinType:
      event["__typename"] === "AddrChanged"
        ? 60n
        : event["__typename"] === "MulticoinAddrChanged"
          ? decodeBigInt(event.coinType)
          : null,
  };
};

export const normalizeV2Event = (
  event: V2Event,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): IndexedEvent => {
  const protocol = Schema.decodeUnknownSync(Schema.Literals(["v1", "v2"]))(event.protocol);
  const payload = parseData(event.data);
  const name = event.name ?? stringFrom(payload, "name");

  const common = eventBase(context, protocol, {
    id: event.id,
    type: event.type,
    name,
    namehash: namehashFrom(event.namehash, name, payload),
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
    transactionHash: event.transactionHash,
    contractAddress: event.contractAddress,
    data: event.data,
  });

  switch (event.type.toLowerCase()) {
    case "eacroleschanged": {
      const roleChange = event.asEACRolesChanged ?? payload;
      const roles = bigintFrom(roleChange, "newRoleBitmap", "roles", "role");

      return {
        ...common,
        kind: "role",
        account: addressFrom(roleChange, "account", "user"),
        resource: nullableHex(stringFrom(roleChange, "resource")),
        roles,
        active: roles !== null && roles !== 0n,
      };
    }

    case "nameregistered": {
      const details = event.asNameRegistered;

      return {
        ...common,
        kind: "registration",
        registrationKind: "name",
        registrant: nullableAddress(details?.owner ?? stringFrom(payload, "owner", "registrant")),
        expiry: nullableBigInt(details?.expires ?? stringFrom(payload, "expires", "expiry")),
        cost: nullableBigInt(details?.cost ?? payload.cost),
        baseCost: nullableBigInt(details?.baseCost ?? payload.baseCost),
        premium: nullableBigInt(details?.premium ?? payload.premium),
        referrer: nullableHex(details?.referrer ?? payload.referrer),
      };
    }
    case "labelregistered": {
      const details = event.asLabelRegistered;

      return {
        ...common,
        kind: "registration",
        registrationKind: "label",
        registrant: nullableAddress(details?.owner ?? payload.owner),
        expiry: nullableBigInt(details?.expiry ?? payload.expiry),
        cost: null,
        baseCost: null,
        premium: null,
        referrer: null,
      };
    }
    case "namerenewed":
      return {
        ...common,
        kind: "renewal",
        expiry: nullableBigInt(event.asNameRenewed?.expires ?? payload.expires),
      };
    case "transfer": {
      const details = event.asTransfer;

      return {
        ...common,
        kind: "transfer",
        from: nullableAddress(details?.from ?? payload.from),
        to: nullableAddress(details?.to ?? payload.to),
        tokenId: nullableBigInt(details?.id ?? details?.value ?? payload.tokenId ?? payload.id),
      };
    }
    case "registrytransfer":
      return {
        ...common,
        kind: "transfer",
        from: null,
        to: nullableAddress(event.asRegistryTransfer?.owner ?? payload.owner),
        tokenId: null,
      };
    case "resolverupdated":
    case "newresolver":
      return {
        ...common,
        kind: "resolver",
        resolver: nullableAddress(event.asResolverUpdated?.resolver ?? payload.resolver),
      };
    case "newttl":
      return { ...common, kind: "ttl", ttl: bigintFrom(payload, "ttl") ?? 0n };
    case "namewrapped":
      return {
        ...common,
        kind: "wrap",
        owner: nullableAddress(event.asNameWrapped?.owner ?? payload.owner),
        fuses: nullableBigInt(event.asNameWrapped?.fuses ?? payload.fuses),
        expiry: nullableBigInt(event.asNameWrapped?.expiry ?? payload.expiry),
      };
    case "nameunwrapped":
      return {
        ...common,
        kind: "unwrap",
        owner: nullableAddress(event.asNameUnwrapped?.owner ?? payload.owner),
      };
    case "fusesset":
      return {
        ...common,
        kind: "fuses",
        fuses: nullableBigInt(event.asFusesSet?.fuses ?? payload.fuses) ?? 0n,
      };
    case "expiryupdated":
    case "expiryextended":
      return {
        ...common,
        kind: "expiry",
        expiry:
          nullableBigInt(event.asExpiryUpdated?.expiry ?? payload.expiry ?? payload.newExpiry) ??
          0n,
      };
    case "reverseclaimed":
      return {
        ...common,
        kind: "reverse",
        address: nullableAddress(event.asReverseClaimed?.address ?? payload.address),
      };
    case "addressupdated":
    case "addresschanged":
    case "addrchanged":
    case "multicoinaddrchanged":
    case "textupdated":
    case "textchanged":
    case "contenthashupdated":
    case "contenthashchanged":
    case "abiupdated":
    case "abichanged":
    case "pubkeychanged":
    case "interfaceupdated":
    case "interfacechanged":
    case "nameupdated":
    case "namechanged":
    case "authorisationchanged":
    case "authorizationchanged":
    case "versionchanged": {
      if (common.namehash === null) return { ...common, kind: "unknown", eventType: event.type };

      const record = normalizeV2RecordEvent(event, { ...context, namehash: common.namehash });

      return recordEvent(common, record);
    }
    default: {
      const type = event.type.toLowerCase();

      if (type.includes("migrat"))
        return { ...common, kind: "migration", owner: addressFrom(payload, "owner", "registrant") };

      if (type.includes("subregistry"))
        return {
          ...common,
          kind: "subregistry",
          registry: addressFrom(payload, "registry"),
          subregistry: addressFrom(payload, "subregistry"),
        };

      if (type.includes("role"))
        return {
          ...common,
          kind: "role",
          account: addressFrom(payload, "account", "user"),
          resource: nullableHex(stringFrom(payload, "resource")),
          roles: bigintFrom(payload, "roles", "role"),
          active: !type.includes("revok") && payload.active !== false,
        };

      return { ...common, kind: "unknown", eventType: event.type };
    }
  }
};
