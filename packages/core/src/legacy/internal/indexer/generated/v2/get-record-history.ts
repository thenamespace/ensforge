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

export type V2GetRecordHistoryQueryVariables = Exact<{
  first: number;
  after?: string | null | undefined;
  where: EventFilter;
  orderDirection: OrderDirection;
}>;

export type V2GetRecordHistoryQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly eventConnection: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly id: string;
        readonly type: string;
        readonly protocol: string;
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
        readonly asTextChanged: {
          readonly key: string | null;
          readonly value: string | null;
        } | null;
      };
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export const V2GetRecordHistoryDocument =
  "query V2GetRecordHistory($first: Int!, $after: String, $where: EventFilter!, $orderDirection: OrderDirection!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  eventConnection(\n    first: $first\n    after: $after\n    where: $where\n    orderBy: blockNumber\n    orderDirection: $orderDirection\n  ) {\n    edges {\n      cursor\n      node {\n        id\n        type\n        protocol\n        namehash\n        blockNumber\n        timestamp\n        transactionHash\n        contractAddress\n        data\n        key\n        value\n        asAddressChanged {\n          address\n          coinType\n        }\n        asTextChanged {\n          key\n          value\n        }\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}" as TypedDocumentString<
    V2GetRecordHistoryQuery,
    V2GetRecordHistoryQueryVariables
  >;
