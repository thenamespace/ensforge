/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2IndexerStatusQueryVariables = Exact<{ [key: string]: never }>;

export type V2IndexerStatusQuery = {
  readonly _meta: {
    readonly deployment: string | null;
    readonly hasIndexingErrors: boolean;
    readonly block: {
      readonly number: number;
      readonly hash: string | null;
      readonly timestamp: number | null;
    };
  };
};

export const V2IndexerStatusDocument =
  "query V2IndexerStatus {\n  _meta {\n    block {\n      number\n      hash\n      timestamp\n    }\n    deployment\n    hasIndexingErrors\n  }\n}" as TypedDocumentString<
    V2IndexerStatusQuery,
    V2IndexerStatusQueryVariables
  >;
