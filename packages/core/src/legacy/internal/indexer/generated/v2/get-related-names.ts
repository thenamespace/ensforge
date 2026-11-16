/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V2IndexedNameFieldsFragment = {
  readonly id: string;
  readonly protocol: string;
  readonly name: string | null;
  readonly labelName: string | null;
  readonly labelhash: string;
  readonly createdAt: number;
  readonly expiryDate: number | null;
  readonly subdomainCount: number;
  readonly isMigrated: boolean;
  readonly ttl: number | null;
  readonly canonicalId: string | null;
  readonly tokenId: string | null;
  readonly tokenVersion: number | null;
  readonly registrationDate: number | null;
  readonly gracePeriodEnd: number | null;
  readonly unreachableSince: number | null;
  readonly isNormalized: boolean;
  readonly isReachable: boolean;
  readonly isWrapped: boolean;
  readonly roleHolderCount: number;
  readonly parent: {
    readonly id: string;
    readonly subregistry: { readonly address: string } | null;
  } | null;
  readonly owner: { readonly id: string };
  readonly registrant: { readonly id: string } | null;
  readonly resolvedAddress: { readonly id: string } | null;
  readonly resolver: { readonly address: string } | null;
  readonly wrappedOwner: { readonly id: string } | null;
  readonly wrappedDomain: {
    readonly fuses: number | null;
    readonly expiryDate: number | null;
    readonly owner: { readonly id: string } | null;
  } | null;
  readonly subregistry: { readonly address: string } | null;
};

export type V2GetRelatedNamesQueryVariables = Exact<{
  first: number;
  names: ReadonlyArray<string> | string;
  includeUnreachable?: boolean | null | undefined;
}>;

export type V2GetRelatedNamesQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly domains: ReadonlyArray<{
    readonly id: string;
    readonly protocol: string;
    readonly name: string | null;
    readonly labelName: string | null;
    readonly labelhash: string;
    readonly createdAt: number;
    readonly expiryDate: number | null;
    readonly subdomainCount: number;
    readonly isMigrated: boolean;
    readonly ttl: number | null;
    readonly canonicalId: string | null;
    readonly tokenId: string | null;
    readonly tokenVersion: number | null;
    readonly registrationDate: number | null;
    readonly gracePeriodEnd: number | null;
    readonly unreachableSince: number | null;
    readonly isNormalized: boolean;
    readonly isReachable: boolean;
    readonly isWrapped: boolean;
    readonly roleHolderCount: number;
    readonly parent: {
      readonly id: string;
      readonly subregistry: { readonly address: string } | null;
    } | null;
    readonly owner: { readonly id: string };
    readonly registrant: { readonly id: string } | null;
    readonly resolvedAddress: { readonly id: string } | null;
    readonly resolver: { readonly address: string } | null;
    readonly wrappedOwner: { readonly id: string } | null;
    readonly wrappedDomain: {
      readonly fuses: number | null;
      readonly expiryDate: number | null;
      readonly owner: { readonly id: string } | null;
    } | null;
    readonly subregistry: { readonly address: string } | null;
  }>;
};

export const V2GetRelatedNamesDocument =
  "query V2GetRelatedNames($first: Int!, $names: [String!]!, $includeUnreachable: Boolean) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domains(\n    first: $first\n    where: {name_in: $names, includeUnreachable: $includeUnreachable}\n  ) {\n    ...V2IndexedNameFields\n  }\n}\n\nfragment V2IndexedNameFields on Domain {\n  id\n  protocol\n  name\n  labelName\n  labelhash\n  parent {\n    id\n    subregistry {\n      address\n    }\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n  subregistry {\n    address\n  }\n  canonicalId\n  tokenId\n  tokenVersion\n  registrationDate\n  gracePeriodEnd\n  unreachableSince\n  isNormalized\n  isReachable\n  isWrapped\n  roleHolderCount\n}" as TypedDocumentString<
    V2GetRelatedNamesQuery,
    V2GetRelatedNamesQueryVariables
  >;
