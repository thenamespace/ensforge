/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
/**
 * Filter input for the `accounts` query (subgraph parity). All fields are optional;
 * fields combine with AND semantics. `id`/`id_in` match exact addresses; `seenV1`/`seenV2`
 * filter by the per-protocol observation flag.
 */
export type AccountFilter = {
  /** Exact address match. */
  readonly id?: string | null | undefined;
  /** Address in list (up to 1000). */
  readonly id_in?: ReadonlyArray<string> | null | undefined;
  /** Restrict to addresses observed under V1 (true) or never observed under V1 (false). */
  readonly seenV1?: boolean | null | undefined;
  /** Restrict to addresses observed under V2 (true) or never observed under V2 (false). */
  readonly seenV2?: boolean | null | undefined;
};

/** Filter criteria for querying domains */
export type DomainFilter = {
  /**
   * Boolean AND: every sub-filter must match. Each element is a full DomainFilter,
   *   nested recursively (subgraph parity). Combined with the other fields by AND.
   */
  readonly and?: ReadonlyArray<DomainFilter> | null | undefined;
  /** Exact match on the version-masked canonical id (ensv2 extension; low 32 bits zeroed) — stable across token version bumps, for callers holding a possibly-stale token id. Accepts 0x-hex or decimal. */
  readonly canonicalId?: string | null | undefined;
  /** Subgraph-compatible alias for `expiry_gt`. */
  readonly expiryDate_gt?: number | null | undefined;
  /** Subgraph-compatible alias for `expiry_gte`. */
  readonly expiryDate_gte?: number | null | undefined;
  /** Subgraph-compatible alias for `expiry_lt`. */
  readonly expiryDate_lt?: number | null | undefined;
  /** Subgraph-compatible alias for `expiry_lte`. */
  readonly expiryDate_lte?: number | null | undefined;
  /** Filter by expiry date greater than (Unix timestamp) */
  readonly expiry_gt?: number | null | undefined;
  /** Filter by expiry date greater than or equal (Unix timestamp) */
  readonly expiry_gte?: number | null | undefined;
  /** Filter by expiry date less than (Unix timestamp) */
  readonly expiry_lt?: number | null | undefined;
  /** Filter by expiry date less than or equal (Unix timestamp) */
  readonly expiry_lte?: number | null | undefined;
  /** Filter by whether domain has direct subdomains (one level only) */
  readonly hasSubdomains?: boolean | null | undefined;
  /**
   * Include non-normalized domains (e.g. `Nick.eth`, `VITALIK`) that are
   *   hidden by default. Default false. Ignored when `isNormalized` is set.
   */
  readonly includeUnnormalized?: boolean | null | undefined;
  /**
   * Include domains that are unreachable via canonical resolution
   *   (orphaned by subregistry repoints, label unregistration, or expired
   *   ancestors). Default false — set true for audit / debug queries.
   */
  readonly includeUnreachable?: boolean | null | undefined;
  /** Filter by migration status */
  readonly isMigrated?: boolean | null | undefined;
  /**
   * Filter by ENSIP-15 normalization status. When omitted, only normalized
   *   names are returned (non-normalized names like `Nick.eth` are hidden by
   *   default); set explicitly to `true`/`false` to filter, or pass
   *   `includeUnnormalized: true` to include both.
   */
  readonly isNormalized?: boolean | null | undefined;
  /** Exact match on leftmost label (subgraph parity). */
  readonly labelName?: string | null | undefined;
  /** Partial label match (contains). */
  readonly labelName_contains?: string | null | undefined;
  /** Case-insensitive partial label match. */
  readonly labelName_contains_nocase?: string | null | undefined;
  /** Label ends with suffix. */
  readonly labelName_ends_with?: string | null | undefined;
  /** Case-insensitive label-suffix match. */
  readonly labelName_ends_with_nocase?: string | null | undefined;
  /** Label in list (up to 1000 labels). */
  readonly labelName_in?: ReadonlyArray<string> | null | undefined;
  /** Negated exact-label match. */
  readonly labelName_not?: string | null | undefined;
  /** Negated partial label match. */
  readonly labelName_not_contains?: string | null | undefined;
  /** Negated label-in-list (up to 1000 labels). */
  readonly labelName_not_in?: ReadonlyArray<string> | null | undefined;
  /** Label starts with prefix. */
  readonly labelName_starts_with?: string | null | undefined;
  /** Case-insensitive label-prefix match. */
  readonly labelName_starts_with_nocase?: string | null | undefined;
  /** Exact name match (list filter). Unlike domain(id:), the domains/domainConnection list default-hides non-normalized, unreachable, and synthetic-root rows unless includeUnnormalized / includeUnreachable / isNormalized override. */
  readonly name?: string | null | undefined;
  /** Partial name match (contains) */
  readonly name_contains?: string | null | undefined;
  /** Case-insensitive partial name match */
  readonly name_contains_nocase?: string | null | undefined;
  /** Name ends with suffix */
  readonly name_ends_with?: string | null | undefined;
  /** Case-insensitive suffix match (subgraph parity). */
  readonly name_ends_with_nocase?: string | null | undefined;
  /** Filter by name in list (up to 1000 names) */
  readonly name_in?: ReadonlyArray<string> | null | undefined;
  /** Negated exact-name match (subgraph parity). */
  readonly name_not?: string | null | undefined;
  /** Negated partial name match (subgraph parity). */
  readonly name_not_contains?: string | null | undefined;
  /** Negated name-in-list (subgraph parity, up to 1000 names). */
  readonly name_not_in?: ReadonlyArray<string> | null | undefined;
  /** Name starts with prefix */
  readonly name_starts_with?: string | null | undefined;
  /** Case-insensitive prefix match (subgraph parity). */
  readonly name_starts_with_nocase?: string | null | undefined;
  /**
   * Boolean OR: any sub-filter matches. Each element is a full DomainFilter, nested
   *   recursively (subgraph parity). The OR group is AND-combined with sibling fields,
   *   so `{ owner: X, or: [{...A}, {...B}] }` means `owner=X AND (A OR B)`. Default
   *   visibility (reachable/normalized/non-root) is applied once to the whole result.
   */
  readonly or?: ReadonlyArray<DomainFilter> | null | undefined;
  /** Filter by owner address */
  readonly owner?: string | null | undefined;
  /** Nested-relation filter on owner Account (subgraph parity). E.g. `{owner_: {id_in: [...]}}`. */
  readonly owner_?: AccountFilter | null | undefined;
  /** Filter by owner address in list */
  readonly owner_in?: ReadonlyArray<string> | null | undefined;
  /** Negated owner address match (subgraph parity). */
  readonly owner_not?: string | null | undefined;
  /** Negated owner-in-list (subgraph parity). */
  readonly owner_not_in?: ReadonlyArray<string> | null | undefined;
  /** Registry contract address filter (ensv2 extension) — the V2 registry that owns this name's label. Combine with tokenId/canonicalId to scope a marketplace tokenId lookup to one registry. */
  readonly registry?: string | null | undefined;
  /** Filter by resolved address */
  readonly resolvedAddress?: string | null | undefined;
  /** Filter by resolver contract address */
  readonly resolver?: string | null | undefined;
  /** Filter by direct subdomain count greater than (one level only) */
  readonly subdomainCount_gt?: number | null | undefined;
  /** Filter by direct subdomain count less than (one level only) */
  readonly subdomainCount_lt?: number | null | undefined;
  /** Exact match on the current versioned ERC-1155 token id (ensv2 extension) — the labelhash with its low 32 bits replaced by the token's version counter, exactly what NFT platforms send. Accepts 0x-hex or decimal. Hashing is one-way, so this is the tokenId-to-name reverse path; combine with `registry` to scope to one registry contract. */
  readonly tokenId?: string | null | undefined;
};

/** Fields to order Domain results by */
export type Domain_OrderBy = "createdAt" | "expiryDate" | "id" | "name" | "registrationDate";

/** Order direction for sorting */
export type OrderDirection = "asc" | "desc";

export type V2IndexedNameFieldsFragment = {
  readonly id: string;
  readonly protocol: string;
  readonly name: string | null;
  readonly labelName: string | null;
  readonly labelhash: string;
  readonly createdAt: number;
  readonly expiryDate: number | null;
  readonly subdomainCount: number;
  readonly isMigrated: boolean;
  readonly ttl: number | null;
  readonly canonicalId: string | null;
  readonly tokenId: string | null;
  readonly tokenVersion: number | null;
  readonly registrationDate: number | null;
  readonly gracePeriodEnd: number | null;
  readonly unreachableSince: number | null;
  readonly isNormalized: boolean;
  readonly isReachable: boolean;
  readonly isWrapped: boolean;
  readonly roleHolderCount: number;
  readonly parent: {
    readonly id: string;
    readonly subregistry: { readonly address: string } | null;
  } | null;
  readonly owner: { readonly id: string };
  readonly registrant: { readonly id: string } | null;
  readonly resolvedAddress: { readonly id: string } | null;
  readonly resolver: { readonly address: string } | null;
  readonly wrappedOwner: { readonly id: string } | null;
  readonly wrappedDomain: {
    readonly fuses: number | null;
    readonly expiryDate: number | null;
    readonly owner: { readonly id: string } | null;
  } | null;
  readonly subregistry: { readonly address: string } | null;
};

export type V2GetSubnamesQueryVariables = Exact<{
  id: string;
  first: number;
  skip: number;
  where?: DomainFilter | null | undefined;
  orderBy: Domain_OrderBy;
  orderDirection: OrderDirection;
}>;

export type V2GetSubnamesQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly domain: {
    readonly subregistry: {
      readonly labels: ReadonlyArray<{
        readonly id: string;
        readonly protocol: string;
        readonly name: string | null;
        readonly labelName: string | null;
        readonly labelhash: string;
        readonly createdAt: number;
        readonly expiryDate: number | null;
        readonly subdomainCount: number;
        readonly isMigrated: boolean;
        readonly ttl: number | null;
        readonly canonicalId: string | null;
        readonly tokenId: string | null;
        readonly tokenVersion: number | null;
        readonly registrationDate: number | null;
        readonly gracePeriodEnd: number | null;
        readonly unreachableSince: number | null;
        readonly isNormalized: boolean;
        readonly isReachable: boolean;
        readonly isWrapped: boolean;
        readonly roleHolderCount: number;
        readonly parent: {
          readonly id: string;
          readonly subregistry: { readonly address: string } | null;
        } | null;
        readonly owner: { readonly id: string };
        readonly registrant: { readonly id: string } | null;
        readonly resolvedAddress: { readonly id: string } | null;
        readonly resolver: { readonly address: string } | null;
        readonly wrappedOwner: { readonly id: string } | null;
        readonly wrappedDomain: {
          readonly fuses: number | null;
          readonly expiryDate: number | null;
          readonly owner: { readonly id: string } | null;
        } | null;
        readonly subregistry: { readonly address: string } | null;
      }>;
    } | null;
  } | null;
};

export const V2GetSubnamesDocument =
  "query V2GetSubnames($id: String!, $first: Int!, $skip: Int!, $where: DomainFilter, $orderBy: Domain_orderBy!, $orderDirection: OrderDirection!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domain(id: $id) {\n    subregistry {\n      labels(\n        first: $first\n        skip: $skip\n        where: $where\n        orderBy: $orderBy\n        orderDirection: $orderDirection\n      ) {\n        ...V2IndexedNameFields\n      }\n    }\n  }\n}\n\nfragment V2IndexedNameFields on Domain {\n  id\n  protocol\n  name\n  labelName\n  labelhash\n  parent {\n    id\n    subregistry {\n      address\n    }\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n  subregistry {\n    address\n  }\n  canonicalId\n  tokenId\n  tokenVersion\n  registrationDate\n  gracePeriodEnd\n  unreachableSince\n  isNormalized\n  isReachable\n  isWrapped\n  roleHolderCount\n}" as TypedDocumentString<
    V2GetSubnamesQuery,
    V2GetSubnamesQueryVariables
  >;
