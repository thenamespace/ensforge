/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V1GetIndexedRecordsQueryVariables = Exact<{
  id: string | number;
  domainId: string;
  first: number;
}>;

export type V1GetIndexedRecordsQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly domain: { readonly resolver: { readonly id: string } | null } | null;
  readonly resolvers: ReadonlyArray<{
    readonly id: string;
    readonly address: `0x${string}`;
    readonly texts: ReadonlyArray<string> | null;
    readonly coinTypes: ReadonlyArray<string> | null;
    readonly contentHash: `0x${string}` | null;
    readonly events: ReadonlyArray<
      | { readonly __typename: "AbiChanged"; readonly contentType: string }
      | { readonly __typename: "AddrChanged" }
      | {
          readonly __typename: "AuthorisationChanged";
          readonly owner: `0x${string}`;
          readonly target: `0x${string}`;
          readonly isAuthorized: boolean;
        }
      | { readonly __typename: "ContenthashChanged" }
      | {
          readonly __typename: "InterfaceChanged";
          readonly interfaceID: `0x${string}`;
          readonly implementer: `0x${string}`;
        }
      | { readonly __typename: "MulticoinAddrChanged" }
      | { readonly __typename: "NameChanged"; readonly name: string }
      | {
          readonly __typename: "PubkeyChanged";
          readonly x: `0x${string}`;
          readonly y: `0x${string}`;
        }
      | { readonly __typename: "TextChanged" }
      | { readonly __typename: "VersionChanged"; readonly version: string }
    >;
  }>;
};

export const V1GetIndexedRecordsDocument =
  "query V1GetIndexedRecords($id: ID!, $domainId: String!, $first: Int!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domain(id: $id) {\n    resolver {\n      id\n    }\n  }\n  resolvers(first: $first, where: {domain: $domainId}) {\n    id\n    address\n    texts\n    coinTypes\n    contentHash\n    events(first: 1000, orderBy: blockNumber, orderDirection: desc) {\n      __typename\n      ... on AbiChanged {\n        contentType\n      }\n      ... on AuthorisationChanged {\n        owner\n        target\n        isAuthorized\n      }\n      ... on InterfaceChanged {\n        interfaceID\n        implementer\n      }\n      ... on NameChanged {\n        name\n      }\n      ... on PubkeyChanged {\n        x\n        y\n      }\n      ... on VersionChanged {\n        version\n      }\n    }\n  }\n}" as TypedDocumentString<
    V1GetIndexedRecordsQuery,
    V1GetIndexedRecordsQueryVariables
  >;
