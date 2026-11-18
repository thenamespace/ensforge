import type { Address } from "viem";

import type { EventType } from "../actions/event/types.js";
import type {
  AddressName,
  Authority,
  ExpiringName,
  IndexedEvent,
  IndexedName,
  IndexedNameDetail,
  IndexedPrimaryName,
  IndexedRecords,
  IndexedRegistry,
  IndexedResolver,
  IndexerStatus,
  LookupResult,
  Namespace,
  NamespaceInfo,
  Page,
  PermissionRow,
  RegistryLabel,
  Relation,
  ResolverLink,
  ResolverRole,
  Result,
  RoleHolderResolver,
  Subname,
} from "./types.js";

/**
 * An indexer ensforge reads through: `bigname()`, `goldsky()`, `fallback([...])` or
 * `defineIndexer({...})`. Pass it to `Ensforge.create({ indexer })`.
 *
 * @category indexer
 * @since 1.0.0
 */
export interface Indexer {
  /** Adapter id, reported as `indexer` on every answer. */
  readonly id: string;
  /**
   * The adapter and where it reads from, e.g. `bigname:https://bigname.internal`: two indexers
   * with the same key answer alike, so caches (React's) can share their answers.
   */
  readonly key: string;
  readonly "~ensforge/indexer": true;
}

/**
 * The queries an adapter answers. Actions validate and normalize their options first: names are
 * normalized, addresses checksummed and the namespace resolved.
 *
 * @category indexer
 * @since 1.0.0
 */
export declare namespace Query {
  /** Snapshot selection, on routes that read one snapshot (names, records, registries, resolvers). */
  type Snapshot = {
    /** Read at a snapshot: an earlier answer's `asOfToken`, or a time. */
    at?: { readonly token: string } | { readonly timestamp: bigint | Date } | undefined;
    /** @default "latest" */
    finality?: "latest" | "safe" | "finalized" | undefined;
  };

  /** Paging, on list routes. */
  type List = {
    /** Rows per page, 1–200. @default 50 */
    limit?: number | undefined;
    /** The previous page's `cursor`. */
    cursor?: string | undefined;
    /** Count every row (`totalCount`); slower. */
    includeTotal?: boolean | undefined;
  };

  type GetName = Snapshot & {
    name: string;
    namespace: Namespace;
    /** `verified` reads the answer on-chain through the indexer. @default "indexed" */
    source?: "indexed" | "verified" | undefined;
  };

  type GetNamesForAddress = List & {
    address: Address;
    /** Every namespace the indexer serves when omitted. */
    namespace?: Namespace | undefined;
    /**
     * Relations to list; `any` is owner, manager and role holder. `resolvesTo` and `formerOwner`
     * stand alone. @default "any"
     */
    relation?: Relation | "any" | readonly Relation[] | undefined;
    /** Coin type for `resolvesTo`, or `evm` for every EVM chain. @default 60 */
    coinType?: bigint | "evm" | undefined;
    /** Only direct children of this name. */
    parent?: string | undefined;
    authority?: Authority | readonly Authority[] | undefined;
    /** Only names migrated to ENSv2 (or only not migrated). */
    migrated?: boolean | undefined;
    /** Expiry bounds (Unix seconds or dates), with `formerOwner` only. */
    expiresAfter?: bigint | Date | undefined;
    expiresBefore?: bigint | Date | undefined;
    search?: string | undefined;
    /** @default "prefix" */
    match?: "prefix" | "contains" | undefined;
    sort?: "name" | "expiry" | "registered" | "created" | undefined;
    order?: "asc" | "desc" | undefined;
    /** One row per name, or per registration. @default "name" */
    dedupe?: "name" | "registration" | undefined;
  };

  type GetSubnames = List & {
    name: string;
    namespace: Namespace;
    search?: string | undefined;
    match?: "prefix" | "contains" | undefined;
    /** @default "name" */
    sort?: "name" | "expiry" | "registered" | undefined;
    order?: "asc" | "desc" | undefined;
    /** @default true */
    includeExpired?: boolean | undefined;
  };

  /** History filters shared by `getHistory` and `getEvents`. */
  type HistoryFilters = List & {
    types?: readonly EventType[] | undefined;
    excludeTypes?: readonly EventType[] | undefined;
    /** Record key, e.g. `avatar`, `text:url` or `addr:60`. */
    recordKey?: string | undefined;
    /** Inclusive time bounds (Unix seconds or dates). */
    from?: bigint | Date | undefined;
    to?: bigint | Date | undefined;
    /** @default "desc" */
    order?: "asc" | "desc" | undefined;
    /** Include each event's details (`data`, `action`). @default true */
    includeData?: boolean | undefined;
  };

  type GetHistory = HistoryFilters &
    (
      | {
          name: string;
          namespace: Namespace;
          address?: undefined;
          /** Name events, registration events, or both. @default "both" */
          scope?: "name" | "registration" | "both" | undefined;
          /** Also the registrations of its children. */
          includeChildRegistrations?: boolean | undefined;
        }
      | {
          address: Address;
          namespace?: Namespace | undefined;
          name?: undefined;
          scope?: "name" | "registration" | "both" | undefined;
          /** @default ["owner", "manager", "roleHolder"] */
          relation?: readonly ("owner" | "manager" | "roleHolder")[] | undefined;
        }
    );

  type GetEvents = HistoryFilters & {
    namespace?: Namespace | undefined;
    name?: string | undefined;
    address?: Address | undefined;
    resolver?: { readonly chainId: number; readonly address: Address } | undefined;
    /** Emitting contract. */
    contract?: Address | undefined;
    registrationId?: string | undefined;
    fromBlock?: bigint | undefined;
    toBlock?: bigint | undefined;
  };

  type Search = List & {
    query: string;
    namespace?: Namespace | undefined;
    /** @default "prefix" */
    match?: "prefix" | "contains" | undefined;
  };

  type Lookup = {
    /** Names and addresses, up to 1,000. */
    inputs: readonly string[];
    namespace?: Namespace | undefined;
    /** `detail` adds records and resolution. @default "feed" */
    profile?: "feed" | "detail" | undefined;
  };

  /** A half-open window `[after, before)`, Unix seconds or dates. */
  type Window = { readonly after: bigint | Date; readonly before: bigint | Date };

  type GetNamesByExpiry = List & {
    namespace: Namespace;
    expiresAfter?: bigint | Date | undefined;
    expiresBefore?: bigint | Date | undefined;
    /** Up to 32 disjoint expiry windows; results report the matching `windowIndex`. */
    windows?: readonly Window[] | undefined;
    graceEndsAfter?: bigint | Date | undefined;
    graceEndsBefore?: bigint | Date | undefined;
    graceWindows?: readonly Window[] | undefined;
    authority?: Authority | readonly Authority[] | undefined;
    parent?: string | undefined;
    sort?: "expiry" | "graceEnd" | undefined;
    order?: "asc" | "desc" | undefined;
  };

  type GetPrimaryName = {
    address: Address;
    /** @default 60n */
    coinType?: bigint | undefined;
    namespace?: Namespace | undefined;
    /** Both, verified first, when omitted. */
    source?: "indexed" | "verified" | undefined;
  };

  type GetRecords = Snapshot & {
    name: string;
    namespace: Namespace;
    /** Record keys (`avatar`, `text:url`, `addr:60`, `contenthash`); the inventory's when omitted. */
    keys?: readonly string[] | undefined;
    /** `false` returns only the inventory, without values. @default true */
    values?: boolean | undefined;
    /** @default "indexed" */
    source?: "indexed" | "verified" | "auto" | undefined;
    /** Read the records the name has on this resolver instead of its current one. */
    resolver?: { readonly chainId: number; readonly address: Address } | undefined;
  };

  type GetPermissions = List & {
    namespace?: Namespace | undefined;
    /** Include how each grant was obtained. */
    includeLineage?: boolean | undefined;
  } & (
      | { name: string; registrationId?: undefined; address?: undefined; registry?: undefined }
      | { registrationId: string; name?: undefined; address?: undefined; registry?: undefined }
      | { address: Address; name?: undefined; registrationId?: undefined; registry?: undefined }
      | {
          registry: { readonly chainId: number; readonly address: Address };
          name?: undefined;
          registrationId?: undefined;
          address?: undefined;
        }
    );

  /** A contract on the client's chain unless `chainId` says otherwise. */
  type Contract = { address: Address; chainId: number };

  type GetRegistry = Snapshot & Contract & { includeCounts?: boolean | undefined };
  type GetRegistryLabels = List &
    Contract & { owner?: Address | undefined; excludeOwner?: Address | undefined };
  type GetResolver = Snapshot & Contract & List;
  type GetResolverLinks = Snapshot & Contract & List;
  type GetResolverRoles = Snapshot & Contract & List;
  type GetResolvers = List & { roleHolder: Address; chainId?: number | undefined };
  type GetNamespace = { namespace: Namespace };
  type GetStatus = {};
}

/**
 * Every query an adapter can answer, with its query and answer types. `null` answers mean
 * "not found".
 *
 * @category indexer
 * @since 1.0.0
 */
export type Methods = {
  readonly getName: (query: Query.GetName) => Result<IndexedNameDetail> | null;
  readonly getNamesForAddress: (query: Query.GetNamesForAddress) => Page<AddressName>;
  readonly getSubnames: (query: Query.GetSubnames) => Page<Subname>;
  readonly getHistory: (query: Query.GetHistory) => Page<IndexedEvent>;
  readonly getEvents: (query: Query.GetEvents) => Page<IndexedEvent>;
  readonly search: (query: Query.Search) => Page<IndexedName>;
  readonly lookup: (query: Query.Lookup) => Result<{ readonly results: readonly LookupResult[] }>;
  readonly getNamesByExpiry: (query: Query.GetNamesByExpiry) => Page<ExpiringName>;
  readonly getPrimaryName: (query: Query.GetPrimaryName) => Result<IndexedPrimaryName>;
  readonly getRecords: (query: Query.GetRecords) => Result<IndexedRecords> | null;
  readonly getPermissions: (query: Query.GetPermissions) => Page<PermissionRow>;
  readonly getRegistry: (query: Query.GetRegistry) => Result<IndexedRegistry> | null;
  readonly getRegistryLabels: (query: Query.GetRegistryLabels) => Page<RegistryLabel>;
  readonly getResolver: (query: Query.GetResolver) => Result<IndexedResolver> | null;
  readonly getResolverLinks: (query: Query.GetResolverLinks) => Page<ResolverLink>;
  readonly getResolverRoles: (query: Query.GetResolverRoles) => Page<ResolverRole>;
  readonly getResolvers: (query: Query.GetResolvers) => Page<RoleHolderResolver>;
  readonly getNamespace: (query: Query.GetNamespace) => Result<NamespaceInfo> | null;
  readonly getStatus: (query: Query.GetStatus) => IndexerStatus;
};

/**
 * Name of an indexer query.
 *
 * @category indexer
 * @since 1.0.0
 */
export type Method = keyof Methods;

/**
 * What an adapter knows about the call besides its query.
 *
 * @category indexer
 * @since 1.0.0
 */
export type Context = {
  /** Chain of the ensforge client, e.g. 1 for mainnet. */
  readonly chainId: number;
  /** Aborted when the call is cancelled. */
  readonly signal: AbortSignal | undefined;
};
