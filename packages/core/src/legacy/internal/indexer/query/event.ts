import type {
  EventFilter,
  EventOrder,
  IndexedEvent,
} from "../../../actions/indexer/models/event.js";
import { IndexerFilterError } from "../../../errors/indexer-filter-error.js";

export const eventTypes = Object.freeze({
  registration: ["NameRegistered", "LabelRegistered"],
  renewal: ["NameRenewed"],
  transfer: ["Transfer", "RegistryTransfer", "NameTransferred", "WrappedTransfer"],
  resolver: ["ResolverUpdated", "NewResolver"],
  ttl: ["NewTTL"],
  wrap: ["NameWrapped"],
  unwrap: ["NameUnwrapped"],
  fuses: ["FusesSet"],
  expiry: ["ExpiryUpdated", "ExpiryExtended"],
  record: [
    "AddressUpdated",
    "TextUpdated",
    "ContenthashUpdated",
    "ABIUpdated",
    "InterfaceUpdated",
    "NameUpdated",
    "AddressChanged",
    "AddrChanged",
    "MulticoinAddrChanged",
    "TextChanged",
    "ContenthashChanged",
    "ABIChanged",
    "AbiChanged",
    "PubkeyChanged",
    "InterfaceChanged",
    "NameChanged",
    "AuthorisationChanged",
    "AuthorizationChanged",
    "VersionChanged",
  ],
  migration: [],
  subregistry: ["SubregistryUpdated"],
  role: ["EACRolesChanged"],
  reverse: ["ReverseClaimed"],
  unknown: [],
}) satisfies Readonly<Record<IndexedEvent["kind"], ReadonlyArray<string>>>;

export const eventFilterNeedsAllTypes = (filter: EventFilter): boolean =>
  filter.kinds?.some((kind) => eventTypes[kind].length === 0) ?? false;

export const selectedEventTypes = (filter: EventFilter): ReadonlyArray<string> | undefined =>
  filter.kinds === undefined || eventFilterNeedsAllTypes(filter)
    ? undefined
    : filter.kinds.flatMap((kind) => eventTypes[kind]);

export const matchesEventFilter = (event: IndexedEvent, filter: EventFilter): boolean => {
  if (filter.name !== undefined && event.name !== filter.name) return false;

  if (
    filter.namehash !== undefined &&
    event.namehash?.toLowerCase() !== filter.namehash.toLowerCase()
  )
    return false;

  if (filter.protocols !== undefined && !filter.protocols.includes(event.protocol)) return false;

  if (filter.kinds !== undefined && !filter.kinds.includes(event.kind)) return false;

  if (
    filter.contractAddress !== undefined &&
    event.contractAddress?.toLowerCase() !== filter.contractAddress.toLowerCase()
  )
    return false;

  if (filter.blockAfter !== undefined && event.blockNumber <= filter.blockAfter) return false;

  if (filter.blockBefore !== undefined && event.blockNumber >= filter.blockBefore) return false;

  if (
    filter.timestampAfter !== undefined &&
    (event.timestamp === null || event.timestamp <= filter.timestampAfter)
  )
    return false;

  if (
    filter.timestampBefore !== undefined &&
    (event.timestamp === null || event.timestamp >= filter.timestampBefore)
  )
    return false;

  return true;
};

export const compareEvents =
  (order: EventOrder) =>
  (left: IndexedEvent, right: IndexedEvent): number => {
    let compared =
      left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0;

    if (compared === 0) compared = left.id.localeCompare(right.id);

    return order.direction === "asc" ? compared : -compared;
  };

export const validateEventFilter = (filter: EventFilter): void => {
  if (filter.name !== undefined && filter.namehash !== undefined) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "Filter events by name or namehash, not both",
    });
  }

  if (filter.protocols?.length === 0) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "At least one event protocol is required",
    });
  }

  if (filter.kinds?.length === 0) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "At least one event kind is required",
    });
  }

  if (
    filter.name === undefined &&
    filter.namehash === undefined &&
    filter.kinds?.some((kind) => kind === "migration" || kind === "unknown")
  ) {
    throw new IndexerFilterError({
      code: "UNSUPPORTED_FILTER",
      message: "Migration and unknown event filters require a name or namehash",
    });
  }
};
