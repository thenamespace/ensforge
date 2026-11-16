/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2GetResolversForAddressQueryVariables = Exact<{
  owner: string;
  protocol?: string | null | undefined;
}>;

export type V2GetResolversForAddressQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly resolversByOwner: ReadonlyArray<{
    readonly address: string;
    readonly nodeCount: number;
    readonly roleHolderCount: number;
    readonly aliases: ReadonlyArray<{ readonly fromName: string; readonly toName: string }>;
  }>;
};

export const V2GetResolversForAddressDocument =
  "query V2GetResolversForAddress($owner: String!, $protocol: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  resolversByOwner(account: $owner, protocol: $protocol) {\n    address\n    nodeCount\n    aliases {\n      fromName\n      toName\n    }\n    roleHolderCount\n  }\n}" as TypedDocumentString<
    V2GetResolversForAddressQuery,
    V2GetResolversForAddressQueryVariables
  >;
