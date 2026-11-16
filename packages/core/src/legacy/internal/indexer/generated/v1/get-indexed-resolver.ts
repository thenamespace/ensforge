/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V1ResolverBindingFieldsFragment = {
  readonly id: string;
  readonly address: `0x${string}`;
  readonly texts: ReadonlyArray<string> | null;
  readonly coinTypes: ReadonlyArray<string> | null;
  readonly contentHash: `0x${string}` | null;
  readonly domain: { readonly id: string; readonly name: string | null } | null;
};

export type V1GetIndexedResolverQueryVariables = Exact<{
  address: string;
  first: number;
}>;

export type V1GetIndexedResolverQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly resolvers: ReadonlyArray<{
    readonly id: string;
    readonly address: `0x${string}`;
    readonly texts: ReadonlyArray<string> | null;
    readonly coinTypes: ReadonlyArray<string> | null;
    readonly contentHash: `0x${string}` | null;
    readonly domain: { readonly id: string; readonly name: string | null } | null;
  }>;
};

export type V1GetIndexedResolverBindingQueryVariables = Exact<{
  address: string;
  namehash: string;
}>;

export type V1GetIndexedResolverBindingQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly resolvers: ReadonlyArray<{
    readonly id: string;
    readonly address: `0x${string}`;
    readonly texts: ReadonlyArray<string> | null;
    readonly coinTypes: ReadonlyArray<string> | null;
    readonly contentHash: `0x${string}` | null;
    readonly domain: { readonly id: string; readonly name: string | null } | null;
  }>;
};

export const V1GetIndexedResolverDocument =
  "query V1GetIndexedResolver($address: Bytes!, $first: Int!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  resolvers(first: $first, where: {address: $address}) {\n    ...V1ResolverBindingFields\n  }\n}\n\nfragment V1ResolverBindingFields on Resolver {\n  id\n  address\n  texts\n  coinTypes\n  contentHash\n  domain {\n    id\n    name\n  }\n}" as TypedDocumentString<
    V1GetIndexedResolverQuery,
    V1GetIndexedResolverQueryVariables
  >;
export const V1GetIndexedResolverBindingDocument =
  "query V1GetIndexedResolverBinding($address: Bytes!, $namehash: String!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  resolvers(first: 1, where: {address: $address, domain: $namehash}) {\n    ...V1ResolverBindingFields\n  }\n}\n\nfragment V1ResolverBindingFields on Resolver {\n  id\n  address\n  texts\n  coinTypes\n  contentHash\n  domain {\n    id\n    name\n  }\n}" as TypedDocumentString<
    V1GetIndexedResolverBindingQuery,
    V1GetIndexedResolverBindingQueryVariables
  >;
