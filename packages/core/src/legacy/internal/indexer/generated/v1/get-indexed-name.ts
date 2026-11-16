/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V1IndexedNameFieldsFragment = {
  readonly id: string;
  readonly name: string | null;
  readonly labelName: string | null;
  readonly labelhash: `0x${string}` | null;
  readonly createdAt: string;
  readonly expiryDate: string | null;
  readonly subdomainCount: number;
  readonly isMigrated: boolean;
  readonly ttl: string | null;
  readonly parent: { readonly id: string } | null;
  readonly owner: { readonly id: string };
  readonly registrant: { readonly id: string } | null;
  readonly resolvedAddress: { readonly id: string } | null;
  readonly resolver: { readonly address: `0x${string}` } | null;
  readonly registration: {
    readonly registrationDate: string;
    readonly expiryDate: string;
    readonly registrant: { readonly id: string };
  } | null;
  readonly wrappedOwner: { readonly id: string } | null;
  readonly wrappedDomain: {
    readonly fuses: number;
    readonly expiryDate: string;
    readonly owner: { readonly id: string };
  } | null;
};

export type V1GetIndexedNameQueryVariables = Exact<{
  id: string | number;
}>;

export type V1GetIndexedNameQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly domain: {
    readonly id: string;
    readonly name: string | null;
    readonly labelName: string | null;
    readonly labelhash: `0x${string}` | null;
    readonly createdAt: string;
    readonly expiryDate: string | null;
    readonly subdomainCount: number;
    readonly isMigrated: boolean;
    readonly ttl: string | null;
    readonly parent: { readonly id: string } | null;
    readonly owner: { readonly id: string };
    readonly registrant: { readonly id: string } | null;
    readonly resolvedAddress: { readonly id: string } | null;
    readonly resolver: { readonly address: `0x${string}` } | null;
    readonly registration: {
      readonly registrationDate: string;
      readonly expiryDate: string;
      readonly registrant: { readonly id: string };
    } | null;
    readonly wrappedOwner: { readonly id: string } | null;
    readonly wrappedDomain: {
      readonly fuses: number;
      readonly expiryDate: string;
      readonly owner: { readonly id: string };
    } | null;
  } | null;
};

export const V1GetIndexedNameDocument =
  "query V1GetIndexedName($id: ID!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domain(id: $id) {\n    ...V1IndexedNameFields\n  }\n}\n\nfragment V1IndexedNameFields on Domain {\n  id\n  name\n  labelName\n  labelhash\n  parent {\n    id\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  registration {\n    registrant {\n      id\n    }\n    registrationDate\n    expiryDate\n  }\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n}" as TypedDocumentString<
    V1GetIndexedNameQuery,
    V1GetIndexedNameQueryVariables
  >;
