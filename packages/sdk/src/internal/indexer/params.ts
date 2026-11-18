import { Array as Arr, String as Str } from "effect";

import { isAddress } from "viem";

import type { Query } from "../../indexer/Indexer.js";
import type { Relation } from "../../indexer/types.js";
import type { QueryValue } from "./http.js";

type Params = Readonly<Record<string, QueryValue>>;

/** Unix seconds as the decimal string the indexer takes. */
const seconds = (value: bigint | Date | undefined): string | undefined =>
  value === undefined
    ? undefined
    : value instanceof Date
      ? String(Math.floor(value.getTime() / 1000))
      : value.toString();

/** One value or several, in the indexer's snake_case (`roleHolder` → `role_holder`). */
const snakeList = <value extends string>(value: value | readonly value[] | undefined) =>
  value === undefined
    ? undefined
    : Arr.map(typeof value === "string" ? [value] : value, (entry) =>
        // oxlint-disable-next-line effecttsgo/prefer-effect-string -- `Str.replace` takes no replacer function
        entry.replace(/[A-Z]/g, (char) => `_${Str.toLowerCase(char)}`),
      );

const sortKeys: Readonly<Record<string, string>> = {
  name: "name",
  expiry: "expires_at",
  registered: "registered_at",
  created: "created_at",
  graceEnd: "grace_ends_at",
};

const window = (range: Query.Window): string => `${seconds(range.after)}..${seconds(range.before)}`;

export const snapshot = (query: Query.Snapshot): Params => ({
  at:
    query.at === undefined
      ? undefined
      : "token" in query.at
        ? query.at.token
        : seconds(query.at.timestamp),
  finality: query.finality,
});

export const paging = (query: Query.List): Params => ({
  page_size: query.limit,
  cursor: query.cursor,
});

const include = (...values: readonly (string | false | undefined)[]) => {
  const included = Arr.filter(values, (value): value is string => typeof value === "string");
  return included.length === 0 ? undefined : included;
};

export const addressNames = (query: Query.GetNamesForAddress): Params => ({
  namespace: query.namespace,
  relation:
    query.relation === undefined || query.relation === "any"
      ? query.relation
      : snakeList<Relation>(query.relation),
  coin_type: query.coinType === undefined ? undefined : String(query.coinType),
  parent: query.parent,
  authority: snakeList(query.authority),
  is_migrated: query.migrated,
  expires_after: seconds(query.expiresAfter),
  expires_before: seconds(query.expiresBefore),
  q: query.search,
  match: query.match,
  sort: query.sort === undefined ? undefined : sortKeys[query.sort],
  order: query.order,
  dedupe: query.dedupe,
  include: include(query.includeTotal === true && "total_count"),
  ...paging(query),
});

export const subnames = (query: Query.GetSubnames): Params => ({
  namespace: query.namespace,
  q: query.search,
  match: query.match,
  sort: query.sort === undefined ? undefined : sortKeys[query.sort],
  order: query.order,
  include_expired: query.includeExpired,
  include: include(query.includeTotal === true && "total_count"),
  ...paging(query),
});

const historyFilters = (query: Query.HistoryFilters): Params => ({
  type: query.types,
  exclude_type: query.excludeTypes,
  record_key: query.recordKey,
  from_timestamp: seconds(query.from),
  to_timestamp: seconds(query.to),
  order: query.order,
  ...paging(query),
});

export const history = (query: Query.GetHistory): Params => ({
  namespace: query.namespace,
  scope: query.scope,
  relation: query.name === undefined ? snakeList(query.relation) : undefined,
  include: include(
    query.includeData !== false && "data",
    query.includeTotal === true && "total_count",
    query.name !== undefined && query.includeChildRegistrations === true && "child_registrations",
  ),
  ...historyFilters(query),
});

export const events = (query: Query.GetEvents): Params => ({
  namespace: query.namespace,
  name: query.name,
  address: query.address,
  resolver:
    query.resolver === undefined
      ? undefined
      : `${query.resolver.chainId}:${query.resolver.address}`,
  contract_address: query.contract,
  registration_id: query.registrationId,
  from_block: query.fromBlock,
  to_block: query.toBlock,
  include: include(
    query.includeData !== false && "data",
    query.includeTotal === true && "total_count",
  ),
  ...historyFilters(query),
});

export const expiry = (query: Query.GetNamesByExpiry): Params => ({
  namespace: query.namespace,
  expires_after: seconds(query.expiresAfter),
  expires_before: seconds(query.expiresBefore),
  expires_window: query.windows === undefined ? undefined : Arr.map(query.windows, window),
  grace_ends_after: seconds(query.graceEndsAfter),
  grace_ends_before: seconds(query.graceEndsBefore),
  grace_ends_window:
    query.graceWindows === undefined ? undefined : Arr.map(query.graceWindows, window),
  authority: snakeList(query.authority),
  parent: query.parent,
  sort: query.sort === undefined ? undefined : sortKeys[query.sort],
  order: query.order,
  ...paging(query),
});

/** `avatar` → `text:avatar`; `addr:60`, `text:url` and `contenthash` pass through. */
export const recordKey = (key: string): string =>
  Str.includes(":")(key) || key === "contenthash" ? key : `text:${key}`;

export const records = (query: Query.GetRecords): Params => ({
  namespace: query.namespace,
  name: query.resolver === undefined ? undefined : query.name,
  keys: query.keys === undefined ? undefined : Arr.map(query.keys, recordKey),
  values: query.values,
  source: query.source,
  // The inventory is what migration copies; it is small, so it is always requested.
  include: query.resolver === undefined ? ["inventory"] : undefined,
  ...snapshot(query),
});

export const permissions = (query: Query.GetPermissions): Params => ({
  namespace: query.namespace,
  name: query.name,
  registration_id: query.registrationId,
  address: query.address,
  registry:
    query.registry === undefined
      ? undefined
      : `${query.registry.chainId}:${query.registry.address}`,
  include: include(query.includeLineage === true && "lineage"),
  ...paging(query),
});

export const lookup = (query: Query.Lookup) => ({
  inputs: Arr.map(query.inputs, (input) =>
    isAddress(input) ? { address: input } : { name: input },
  ),
  ...(query.namespace === undefined ? {} : { namespace: query.namespace }),
  ...(query.profile === undefined ? {} : { profile: query.profile }),
});
