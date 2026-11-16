/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2GetResolverApprovalsQueryVariables = Exact<{
  delegate?: string | null | undefined;
  namehash?: string | null | undefined;
}>;

export type V2GetResolverApprovalsQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly approvals: ReadonlyArray<{
    readonly id: string;
    readonly resolver: string;
    readonly namehash: string;
    readonly context: string | null;
    readonly delegate: string;
    readonly approved: boolean;
    readonly blockNumber: number;
    readonly timestamp: number;
    readonly transactionHash: string;
    readonly logIndex: number;
  }>;
};

export const V2GetResolverApprovalsDocument =
  "query V2GetResolverApprovals($delegate: String, $namehash: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  approvals(delegate: $delegate, namehash: $namehash) {\n    id\n    resolver\n    namehash\n    context\n    delegate\n    approved\n    blockNumber\n    timestamp\n    transactionHash\n    logIndex\n  }\n}" as TypedDocumentString<
    V2GetResolverApprovalsQuery,
    V2GetResolverApprovalsQueryVariables
  >;
