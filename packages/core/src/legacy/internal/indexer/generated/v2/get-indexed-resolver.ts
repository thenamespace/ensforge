/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2ResolverBindingFieldsFragment = {
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
  readonly domain: { readonly id: string; readonly name: string | null } | null;
};

export type V2GetIndexedResolverQueryVariables = Exact<{
  address: string;
  protocol?: string | null | undefined;
  first: number;
}>;

export type V2GetIndexedResolverQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly detail: {
    readonly address: string;
    readonly nodeCount: number;
    readonly aliasCount: number;
    readonly roleHolderCount: number;
    readonly aliases: ReadonlyArray<{ readonly fromName: string; readonly toName: string }>;
    readonly roles: ReadonlyArray<{
      readonly account: string;
      readonly resource: string;
      readonly name: string | null;
      readonly roleBitmap: string;
      readonly timestamp: number;
    }>;
  } | null;
  readonly bindings: ReadonlyArray<{
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
    readonly domain: { readonly id: string; readonly name: string | null } | null;
  }>;
};

export type V2GetIndexedResolverBindingQueryVariables = Exact<{
  address: string;
  protocol?: string | null | undefined;
  namehash: string;
}>;

export type V2GetIndexedResolverBindingQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly detail: {
    readonly address: string;
    readonly nodeCount: number;
    readonly aliasCount: number;
    readonly roleHolderCount: number;
    readonly aliases: ReadonlyArray<{ readonly fromName: string; readonly toName: string }>;
    readonly roles: ReadonlyArray<{
      readonly account: string;
      readonly resource: string;
      readonly name: string | null;
      readonly roleBitmap: string;
      readonly timestamp: number;
    }>;
  } | null;
  readonly bindings: ReadonlyArray<{
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
    readonly domain: { readonly id: string; readonly name: string | null } | null;
  }>;
};

export const V2GetIndexedResolverDocument =
  "query V2GetIndexedResolver($address: String!, $protocol: String, $first: Int!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  detail: resolver(id: $address) {\n    address\n    nodeCount\n    aliasCount\n    aliases {\n      fromName\n      toName\n    }\n    roleHolderCount\n    roles {\n      account\n      resource\n      name\n      roleBitmap\n      timestamp\n    }\n  }\n  bindings: resolvers(\n    first: $first\n    where: {address: $address, protocol: $protocol}\n  ) {\n    ...V2ResolverBindingFields\n  }\n}\n\nfragment V2ResolverBindingFields on Resolver {\n  id\n  address\n  texts\n  coinTypes\n  contentHash\n  abis\n  pubkey {\n    x\n    y\n  }\n  interfaces {\n    interfaceId\n  }\n  reverseName\n  version\n  domain {\n    id\n    name\n  }\n}" as TypedDocumentString<
    V2GetIndexedResolverQuery,
    V2GetIndexedResolverQueryVariables
  >;
export const V2GetIndexedResolverBindingDocument =
  "query V2GetIndexedResolverBinding($address: String!, $protocol: String, $namehash: String!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  detail: resolver(id: $address) {\n    address\n    nodeCount\n    aliasCount\n    aliases {\n      fromName\n      toName\n    }\n    roleHolderCount\n    roles {\n      account\n      resource\n      name\n      roleBitmap\n      timestamp\n    }\n  }\n  bindings: resolvers(\n    first: 1\n    where: {address: $address, protocol: $protocol, namehash: $namehash}\n  ) {\n    ...V2ResolverBindingFields\n  }\n}\n\nfragment V2ResolverBindingFields on Resolver {\n  id\n  address\n  texts\n  coinTypes\n  contentHash\n  abis\n  pubkey {\n    x\n    y\n  }\n  interfaces {\n    interfaceId\n  }\n  reverseName\n  version\n  domain {\n    id\n    name\n  }\n}" as TypedDocumentString<
    V2GetIndexedResolverBindingQuery,
    V2GetIndexedResolverBindingQueryVariables
  >;
