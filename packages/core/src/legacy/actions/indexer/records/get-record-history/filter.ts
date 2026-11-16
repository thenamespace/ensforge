import type { IndexedRecordEvent, RecordHistoryFilter } from "../../models/record.js";

export const recordEventTypes = Object.freeze({
  address: ["AddressUpdated", "AddressChanged", "AddrChanged", "MulticoinAddrChanged"],
  text: ["TextUpdated", "TextChanged"],
  contenthash: ["ContenthashUpdated", "ContenthashChanged"],
  abi: ["ABIUpdated", "ABIChanged", "AbiChanged"],
  pubkey: ["PubkeyChanged"],
  interface: ["InterfaceUpdated", "InterfaceChanged"],
  "reverse-name": ["NameUpdated", "NameChanged"],
  authorization: ["AuthorisationChanged", "AuthorizationChanged"],
  version: ["VersionChanged"],
  unknown: [],
}) satisfies Readonly<Record<IndexedRecordEvent["kind"], ReadonlyArray<string>>>;

export const matchesRecordHistoryFilter = (
  event: IndexedRecordEvent,
  filter: RecordHistoryFilter,
): boolean => {
  if (filter.kinds !== undefined && !filter.kinds.includes(event.kind)) return false;

  if (filter.textKey !== undefined && (event.kind !== "text" || event.key !== filter.textKey))
    return false;

  if (
    filter.coinType !== undefined &&
    (event.kind !== "address" || event.coinType !== filter.coinType)
  )
    return false;

  if (
    filter.resolver !== undefined &&
    event.resolver.toLowerCase() !== filter.resolver.toLowerCase()
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
