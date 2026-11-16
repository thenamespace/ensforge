/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2GetIndexedRecordsQueryVariables = Exact<{
  name: string;
  namehash: string;
  first: number;
  protocol?: string | null | undefined;
}>;

export type V2GetIndexedRecordsQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly byName: { readonly resolver: { readonly id: string } | null } | null;
  readonly byNamehash: { readonly resolver: { readonly id: string } | null } | null;
  readonly resolvers: ReadonlyArray<{
    readonly id: string;
    readonly address: string;
    readonly texts: ReadonlyArray<string> | null;
    readonly coinTypes: ReadonlyArray<string> | null;
    readonly contentHash: string | null;
    readonly abis: ReadonlyArray<number> | null;
    readonly reverseName: string | null;
    readonly version: number | null;
    readonly pubkey: { readonly x: string; readonly y: string } | null;
    readonly interfaces: ReadonlyArray<{ readonly interfaceId: string }> | null;
  }>;
};

export const V2GetIndexedRecordsDocument =
  "query V2GetIndexedRecords($name: String!, $namehash: String!, $first: Int!, $protocol: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  byName: domain(id: $name) {\n    resolver {\n      id\n    }\n  }\n  byNamehash: domain(id: $namehash) {\n    resolver {\n      id\n    }\n  }\n  resolvers(first: $first, where: {namehash: $namehash, protocol: $protocol}) {\n    id\n    address\n    texts\n    coinTypes\n    contentHash\n    abis\n    pubkey {\n      x\n      y\n    }\n    interfaces {\n      interfaceId\n    }\n    reverseName\n    version\n  }\n}" as TypedDocumentString<
    V2GetIndexedRecordsQuery,
    V2GetIndexedRecordsQueryVariables
  >;
