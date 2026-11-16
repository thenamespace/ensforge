/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
/** Filter criteria for querying events */
export type EventFilter = {
  /** Boolean AND: every sub-filter must match. Each element is a full EventFilter, nested recursively (subgraph parity). */
  readonly and?: ReadonlyArray<EventFilter> | null | undefined;
  /** Filter by block number greater than */
  readonly blockNumber_gt?: number | null | undefined;
  /** Filter by block number greater than or equal */
  readonly blockNumber_gte?: number | null | undefined;
  /** Filter by block number less than */
  readonly blockNumber_lt?: number | null | undefined;
  /** Filter by block number less than or equal */
  readonly blockNumber_lte?: number | null | undefined;
  /** Filter by contract address */
  readonly contractAddress?: string | null | undefined;
  /** Filter by domain name */
  readonly domain?: string | null | undefined;
  /**
   * Address involvement (ensv2 extension): matches events where the address is the
   *   owner, sender (`from`), or recipient (`to`). Per-address history is
   *   `events(where:{involved:"0x…"}, orderBy: blockNumber, orderDirection: asc)`;
   *   per-name history is `events(where:{namehash:"0x…"})`.
   */
  readonly involved?: string | null | undefined;
  /** Filter by namehash */
  readonly namehash?: string | null | undefined;
  /** Boolean OR: any sub-filter matches. Each element is a full EventFilter, nested recursively; the OR group is AND-combined with sibling fields. */
  readonly or?: ReadonlyArray<EventFilter> | null | undefined;
  /** Filter by protocol (v1 or v2) */
  readonly protocol?: string | null | undefined;
  /** Exact match on the EAC resource carried in an `EACRolesChanged` payload. Compared exactly as emitted, version bits included; any hex spelling (zero-trimmed, padded, upper-case) is accepted. Combine with `contractAddress` since ROOT (0x0) exists on every EAC-enabled contract. */
  readonly resource?: string | null | undefined;
  /** Filter by timestamp greater than */
  readonly timestamp_gt?: number | null | undefined;
  /** Filter by timestamp greater than or equal */
  readonly timestamp_gte?: number | null | undefined;
  /** Filter by timestamp less than */
  readonly timestamp_lt?: number | null | undefined;
  /** Filter by timestamp less than or equal */
  readonly timestamp_lte?: number | null | undefined;
  /** Filter by event type (e.g., 'Transfer', 'NameRegistered', 'TextChanged') */
  readonly type?: string | null | undefined;
  /** Filter by event type in list */
  readonly type_in?: ReadonlyArray<string> | null | undefined;
  /** Negated event-type match (subgraph parity). */
  readonly type_not?: string | null | undefined;
  /** Negated event-type-in-list (subgraph parity). */
  readonly type_not_in?: ReadonlyArray<string> | null | undefined;
};

/** Order direction for sorting */
export type OrderDirection = "asc" | "desc";

export type V2GetEventsQueryVariables = Exact<{
  first: number;
  after?: string | null | undefined;
  where: EventFilter;
  orderDirection: OrderDirection;
}>;

export type V2GetEventsQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly eventConnection: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly id: string;
        readonly type: string;
        readonly protocol: string;
        readonly name: string | null;
        readonly namehash: string | null;
        readonly blockNumber: number;
        readonly timestamp: number;
        readonly transactionHash: string;
        readonly contractAddress: string;
        readonly data: string | null;
        readonly key: string | null;
        readonly value: string | null;
        readonly asAddressChanged: {
          readonly address: string | null;
          readonly coinType: number | null;
        } | null;
        readonly asEACRolesChanged: {
          readonly account: string;
          readonly resource: string;
          readonly oldRoleBitmap: string;
          readonly newRoleBitmap: string;
        } | null;
        readonly asExpiryUpdated: {
          readonly expiry: number | null;
          readonly node: string | null;
          readonly tokenId: string | null;
        } | null;
        readonly asFusesSet: { readonly fuses: number | null; readonly node: string | null } | null;
        readonly asLabelRegistered: {
          readonly expiry: number | null;
          readonly name: string | null;
          readonly owner: string | null;
          readonly registry: string | null;
          readonly sender: string | null;
          readonly tokenId: string | null;
        } | null;
        readonly asNameRegistered: {
          readonly baseCost: string | null;
          readonly cost: string | null;
          readonly expires: number | null;
          readonly label: string | null;
          readonly name: string | null;
          readonly owner: string | null;
          readonly premium: string | null;
          readonly referrer: string | null;
        } | null;
        readonly asNameRenewed: {
          readonly expires: number | null;
          readonly id: string | null;
        } | null;
        readonly asNameUnwrapped: {
          readonly node: string | null;
          readonly owner: string | null;
        } | null;
        readonly asNameWrapped: {
          readonly expiry: number | null;
          readonly fuses: number | null;
          readonly node: string | null;
          readonly owner: string | null;
        } | null;
        readonly asRegistryTransfer: {
          readonly node: string | null;
          readonly owner: string | null;
        } | null;
        readonly asResolverUpdated: {
          readonly resolver: string | null;
          readonly sender: string | null;
          readonly tokenId: string | null;
        } | null;
        readonly asReverseClaimed: {
          readonly address: string | null;
          readonly node: string | null;
        } | null;
        readonly asTextChanged: {
          readonly key: string | null;
          readonly value: string | null;
        } | null;
        readonly asTransfer: {
          readonly from: string | null;
          readonly id: string | null;
          readonly operator: string | null;
          readonly to: string | null;
          readonly value: string | null;
        } | null;
      };
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export const V2GetEventsDocument =
  "query V2GetEvents($first: Int!, $after: String, $where: EventFilter!, $orderDirection: OrderDirection!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  eventConnection(\n    first: $first\n    after: $after\n    where: $where\n    orderBy: blockNumber\n    orderDirection: $orderDirection\n  ) {\n    edges {\n      cursor\n      node {\n        id\n        type\n        protocol\n        name\n        namehash\n        blockNumber\n        timestamp\n        transactionHash\n        contractAddress\n        data\n        key\n        value\n        asAddressChanged {\n          address\n          coinType\n        }\n        asEACRolesChanged {\n          account\n          resource\n          oldRoleBitmap\n          newRoleBitmap\n        }\n        asExpiryUpdated {\n          expiry\n          node\n          tokenId\n        }\n        asFusesSet {\n          fuses\n          node\n        }\n        asLabelRegistered {\n          expiry\n          name\n          owner\n          registry\n          sender\n          tokenId\n        }\n        asNameRegistered {\n          baseCost\n          cost\n          expires\n          label\n          name\n          owner\n          premium\n          referrer\n        }\n        asNameRenewed {\n          expires\n          id\n        }\n        asNameUnwrapped {\n          node\n          owner\n        }\n        asNameWrapped {\n          expiry\n          fuses\n          node\n          owner\n        }\n        asRegistryTransfer {\n          node\n          owner\n        }\n        asResolverUpdated {\n          resolver\n          sender\n          tokenId\n        }\n        asReverseClaimed {\n          address\n          node\n        }\n        asTextChanged {\n          key\n          value\n        }\n        asTransfer {\n          from\n          id\n          operator\n          to\n          value\n        }\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}" as TypedDocumentString<
    V2GetEventsQuery,
    V2GetEventsQueryVariables
  >;
