/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2RegistryFieldsFragment = {
  readonly address: string;
  readonly name: string;
  readonly namehash: string;
  readonly parentRegistry: string;
  readonly createdAt: number;
  readonly createdBlock: number;
  readonly labelCount: number;
  readonly referencedByCount: number;
  readonly roleCount: number;
  readonly eventCount: number;
  readonly owner: { readonly id: string } | null;
};

export type V2GetRegistryByAddressQueryVariables = Exact<{
  address: string;
}>;

export type V2GetRegistryByAddressQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly registry: {
    readonly address: string;
    readonly name: string;
    readonly namehash: string;
    readonly parentRegistry: string;
    readonly createdAt: number;
    readonly createdBlock: number;
    readonly labelCount: number;
    readonly referencedByCount: number;
    readonly roleCount: number;
    readonly eventCount: number;
    readonly owner: { readonly id: string } | null;
  } | null;
};

export type V2GetRegistryByNameQueryVariables = Exact<{
  name: string;
}>;

export type V2GetRegistryByNameQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly domain: {
    readonly subregistry: {
      readonly address: string;
      readonly name: string;
      readonly namehash: string;
      readonly parentRegistry: string;
      readonly createdAt: number;
      readonly createdBlock: number;
      readonly labelCount: number;
      readonly referencedByCount: number;
      readonly roleCount: number;
      readonly eventCount: number;
      readonly owner: { readonly id: string } | null;
    } | null;
  } | null;
};

export const V2GetRegistryByAddressDocument =
  "query V2GetRegistryByAddress($address: String!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  registry(address: $address) {\n    ...V2RegistryFields\n  }\n}\n\nfragment V2RegistryFields on RegistryInfo {\n  address\n  name\n  namehash\n  owner {\n    id\n  }\n  parentRegistry\n  createdAt\n  createdBlock\n  labelCount\n  referencedByCount\n  roleCount\n  eventCount\n}" as TypedDocumentString<
    V2GetRegistryByAddressQuery,
    V2GetRegistryByAddressQueryVariables
  >;
export const V2GetRegistryByNameDocument =
  "query V2GetRegistryByName($name: String!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domain(id: $name) {\n    subregistry {\n      ...V2RegistryFields\n    }\n  }\n}\n\nfragment V2RegistryFields on RegistryInfo {\n  address\n  name\n  namehash\n  owner {\n    id\n  }\n  parentRegistry\n  createdAt\n  createdBlock\n  labelCount\n  referencedByCount\n  roleCount\n  eventCount\n}" as TypedDocumentString<
    V2GetRegistryByNameQuery,
    V2GetRegistryByNameQueryVariables
  >;
