/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
/** Order direction for sorting */
export type OrderDirection = "asc" | "desc";

/** Filter criteria for querying registrations */
export type RegistrationFilter = {
  /** Boolean AND: every sub-filter must match. Each element is a full RegistrationFilter, nested recursively (subgraph parity). */
  readonly and?: ReadonlyArray<RegistrationFilter> | null | undefined;
  /** Filter by expiry date greater than */
  readonly expiryDate_gt?: number | null | undefined;
  /** Filter by expiry date greater than or equal */
  readonly expiryDate_gte?: number | null | undefined;
  /** Filter by expiry date less than */
  readonly expiryDate_lt?: number | null | undefined;
  /** Filter by expiry date less than or equal */
  readonly expiryDate_lte?: number | null | undefined;
  /** Boolean OR: any sub-filter matches. Each element is a full RegistrationFilter, nested recursively; the OR group is AND-combined with sibling fields. */
  readonly or?: ReadonlyArray<RegistrationFilter> | null | undefined;
  /** Filter by protocol (v1 or v2) */
  readonly protocol?: string | null | undefined;
  /** Filter by registrant address */
  readonly registrant?: string | null | undefined;
  /** Filter by registrant address in list */
  readonly registrant_in?: ReadonlyArray<string> | null | undefined;
};

/** Fields to order Registration results by */
export type Registration_OrderBy = "expiryDate" | "id" | "name" | "registrationDate";

export type V2GetRegistrationsQueryVariables = Exact<{
  first: number;
  after?: string | null | undefined;
  where: RegistrationFilter;
  orderBy: Registration_OrderBy;
  orderDirection: OrderDirection;
}>;

export type V2GetRegistrationsQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly registrationConnection: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly id: string;
        readonly protocol: string;
        readonly name: string;
        readonly labelName: string | null;
        readonly registrationDate: number;
        readonly expiryDate: number;
        readonly cost: string | null;
        readonly baseCost: string | null;
        readonly premium: string | null;
        readonly referrer: string | null;
        readonly registrant: { readonly id: string };
        readonly domain: { readonly id: string; readonly owner: { readonly id: string } };
      };
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export const V2GetRegistrationsDocument =
  "query V2GetRegistrations($first: Int!, $after: String, $where: RegistrationFilter!, $orderBy: Registration_orderBy!, $orderDirection: OrderDirection!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  registrationConnection(\n    first: $first\n    after: $after\n    where: $where\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n  ) {\n    edges {\n      cursor\n      node {\n        id\n        protocol\n        name\n        labelName\n        registrationDate\n        expiryDate\n        cost\n        baseCost\n        premium\n        referrer\n        registrant {\n          id\n        }\n        domain {\n          id\n          owner {\n            id\n          }\n        }\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}" as TypedDocumentString<
    V2GetRegistrationsQuery,
    V2GetRegistrationsQueryVariables
  >;
