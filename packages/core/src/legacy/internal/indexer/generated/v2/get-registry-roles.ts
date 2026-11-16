/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2GetRegistryRolesQueryVariables = Exact<{
  registry: string;
  account?: string | null | undefined;
  resource?: string | null | undefined;
  first: number;
  after?: string | null | undefined;
}>;

export type V2GetRegistryRolesQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly roleConnection: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly id: string;
        readonly account: string;
        readonly resource: string;
        readonly name: string | null;
        readonly roleBitmap: string;
        readonly permissions: ReadonlyArray<string>;
        readonly blockNumber: number;
        readonly timestamp: number;
        readonly transactionHash: string;
      };
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export const V2GetRegistryRolesDocument =
  'query V2GetRegistryRoles($registry: String!, $account: String, $resource: String, $first: Int!, $after: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  roleConnection(\n    contract: $registry\n    protocol: "v2"\n    account: $account\n    resource: $resource\n    first: $first\n    after: $after\n  ) {\n    edges {\n      cursor\n      node {\n        id\n        account\n        resource\n        name\n        roleBitmap\n        permissions\n        blockNumber\n        timestamp\n        transactionHash\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}' as TypedDocumentString<
    V2GetRegistryRolesQuery,
    V2GetRegistryRolesQueryVariables
  >;
