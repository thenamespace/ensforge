import { Predicate } from "effect";

import { decodeEventLog, isAddress, type Address, type Hex, type Log } from "viem";

import type { EnsEvent, EnsEventKind, GetEnsEventsParameters } from "../../actions/events/types.js";
import { analyzeName } from "../../names/analyze.js";
import { labelhash, namehash } from "../../names/hashes.js";
import { normalizeName } from "../../names/normalize.js";
import type { NormalizedName } from "../../schemas/name.js";
import type { EnsEventContract } from "./contracts.js";

const recordEvents = new Set([
  "ABIChanged",
  "AddrChanged",
  "AddressChanged",
  "AliasChanged",
  "ContenthashChanged",
  "DNSRecordChanged",
  "DNSRecordDeleted",
  "DNSZonehashChanged",
  "DataChanged",
  "InterfaceChanged",
  "NameChanged",
  "PubkeyChanged",
  "TextChanged",
  "VersionChanged",
]);

const eventKind = (eventName: string): EnsEventKind => {
  if (eventName === "CommitmentMade") return "commitment";

  if (eventName === "NameRegistered") return "registration";

  if (eventName === "NameRenewed" || eventName === "ExpiryExtended") return "renewal";

  if (eventName === "NameMigrated") return "migration";

  if (recordEvents.has(eventName)) return "records";

  if (eventName === "NewResolver" || eventName === "ResolverUpdated") return "resolver";

  if (
    eventName === "NewOwner" ||
    eventName === "LabelRegistered" ||
    eventName === "LabelReserved" ||
    eventName === "LabelUnregistered" ||
    eventName === "SubregistryUpdated" ||
    eventName === "RegistryCreated"
  ) {
    return "subname";
  }

  if (
    eventName === "Transfer" ||
    eventName === "TransferSingle" ||
    eventName === "TransferBatch" ||
    eventName === "NameWrapped" ||
    eventName === "NameUnwrapped"
  ) {
    return "ownership";
  }

  if (
    eventName === "EACRolesChanged" ||
    eventName === "Approval" ||
    eventName === "ApprovalForAll"
  ) {
    return "manager";
  }

  return "other";
};

const property = (args: unknown, key: string): unknown =>
  Predicate.isObject(args) ? args[key] : undefined;

const addressProperty = (args: unknown, key: string): Address | undefined => {
  const value = property(args, key);

  return Predicate.isString(value) && isAddress(value) ? value : undefined;
};

const bigintProperty = (args: unknown, ...keys: ReadonlyArray<string>): bigint | undefined => {
  for (const key of keys) {
    const value = property(args, key);

    if (Predicate.isBigInt(value)) return value;
  }

  return undefined;
};

const hexProperty = (args: unknown, key: string): Hex | undefined => {
  const value = property(args, key);

  return Predicate.isString(value) && /^0x[0-9a-fA-F]+$/.test(value) ? (value as Hex) : undefined;
};

const decodedName = (
  args: unknown,
): { readonly name?: NormalizedName; readonly label?: string } => {
  const nameValue = property(args, "name");
  const labelValue = property(args, "label");

  const candidate = Predicate.isString(nameValue)
    ? nameValue
    : Predicate.isString(labelValue)
      ? labelValue
      : undefined;

  if (candidate === undefined) return {};

  try {
    const label = candidate.includes(".") ? undefined : candidate;

    return {
      name: normalizeName(label === undefined ? candidate : `${label}.eth`),
      ...(label === undefined ? {} : { label }),
    };
  } catch {
    return Predicate.isString(labelValue) ? { label: labelValue } : {};
  }
};

export const normalizeEnsLog = (
  log: Log,
  contracts: ReadonlyArray<EnsEventContract>,
): EnsEvent | null => {
  const contract = contracts.find(
    (candidate) => candidate.address.toLowerCase() === log.address.toLowerCase(),
  );

  if (contract === undefined) return null;

  let decoded: { readonly eventName: string; readonly args?: unknown };

  try {
    decoded = decodeEventLog({
      abi: contract.abi,
      data: log.data,
      topics: log.topics,
      strict: false,
    });
  } catch {
    return null;
  }

  const args = decoded.args;
  const identity = decodedName(args);
  const node = hexProperty(args, "node");
  const commitment = hexProperty(args, "commitment");

  return {
    kind: eventKind(decoded.eventName),
    protocol: contract.protocol,
    contractKind: contract.kind,
    eventName: decoded.eventName,
    contract: log.address,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    removed: log.removed,
    ...identity,
    ...(node !== undefined && node.length === 66 ? { node } : {}),
    ...(addressProperty(args, "owner") !== undefined
      ? { owner: addressProperty(args, "owner") }
      : {}),
    ...(addressProperty(args, "from") !== undefined ? { from: addressProperty(args, "from") } : {}),
    ...(addressProperty(args, "to") !== undefined ? { to: addressProperty(args, "to") } : {}),
    ...(addressProperty(args, "resolver") !== undefined
      ? { resolver: addressProperty(args, "resolver") }
      : {}),
    ...(bigintProperty(args, "tokenId", "id") !== undefined
      ? { tokenId: bigintProperty(args, "tokenId", "id") }
      : {}),
    ...(commitment !== undefined && commitment.length === 66 ? { commitment } : {}),
    raw: { topics: [...log.topics], data: log.data, args },
  } as EnsEvent;
};

export const matchesEnsEventFilters = (
  event: EnsEvent,
  parameters: GetEnsEventsParameters,
  normalizedName?: NormalizedName,
): boolean => {
  if (parameters.kinds !== undefined && !parameters.kinds.includes(event.kind)) return false;

  if (parameters.commitment !== undefined && event.commitment !== parameters.commitment)
    return false;

  if (parameters.account !== undefined) {
    const account = parameters.account.toLowerCase();

    if (![event.owner, event.from, event.to].some((value) => value?.toLowerCase() === account)) {
      return false;
    }
  }

  if (normalizedName === undefined) return true;

  if (event.name === normalizedName) return true;

  const analysis = analyzeName(normalizedName);

  const identifiers = new Set<unknown>([
    namehash(normalizedName),
    BigInt(namehash(normalizedName)),
  ]);

  if (analysis.ethSecondLevelLabel !== undefined) {
    identifiers.add(analysis.ethSecondLevelLabel);
    identifiers.add(labelhash(analysis.ethSecondLevelLabel));
    identifiers.add(BigInt(labelhash(analysis.ethSecondLevelLabel)));
  }

  if (event.label !== undefined && identifiers.has(event.label)) return true;

  if (event.node !== undefined && identifiers.has(event.node)) return true;

  if (event.tokenId !== undefined && identifiers.has(event.tokenId)) return true;

  if (!Predicate.isObject(event.raw.args)) return false;

  return Object.values(event.raw.args).some((value) => identifiers.has(value));
};
