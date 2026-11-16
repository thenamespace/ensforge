/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2GetResolverMetadataQueryVariables = Exact<{
  resolver: string;
}>;

export type V2GetResolverMetadataQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly metadata: {
    readonly id: string;
    readonly resolver: string;
    readonly graphqlUrl: string;
    readonly blockNumber: number;
    readonly timestamp: number;
    readonly transactionHash: string;
  } | null;
};

export const V2GetResolverMetadataDocument =
  "query V2GetResolverMetadata($resolver: String!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  metadata(resolver: $resolver) {\n    id\n    resolver\n    graphqlUrl\n    blockNumber\n    timestamp\n    transactionHash\n  }\n}" as TypedDocumentString<
    V2GetResolverMetadataQuery,
    V2GetResolverMetadataQueryVariables
  >;
