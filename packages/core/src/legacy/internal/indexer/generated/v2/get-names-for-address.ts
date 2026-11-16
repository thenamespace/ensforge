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

export type V2GetOwnedNamesQueryVariables = Exact<{
  address: string;
  first: number;
  after?: string | null | undefined;
  includeUnreachable?: boolean | null | undefined;
}>;

export type V2GetOwnedNamesQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly owned: {
    readonly edges: ReadonlyArray<{
      readonly node: {
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
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export type V2GetResolvedNamesQueryVariables = Exact<{
  address: string;
  first: number;
  after?: string | null | undefined;
  includeUnreachable?: boolean | null | undefined;
}>;

export type V2GetResolvedNamesQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly resolved: {
    readonly edges: ReadonlyArray<{
      readonly node: {
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
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export type V2GetRegistrationsForAddressQueryVariables = Exact<{
  address: string;
  first: number;
  after?: string | null | undefined;
}>;

export type V2GetRegistrationsForAddressQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly registrations: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly domain: {
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
      };
    }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export type V2GetRolesForAddressQueryVariables = Exact<{
  address: string;
  first: number;
  after?: string | null | undefined;
}>;

export type V2GetRolesForAddressQuery = {
  readonly _meta: { readonly block: { readonly number: number } };
  readonly roles: {
    readonly edges: ReadonlyArray<{ readonly node: { readonly name: string | null } }>;
    readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
};

export const V2GetOwnedNamesDocument =
  "query V2GetOwnedNames($address: String!, $first: Int!, $after: String, $includeUnreachable: Boolean) {\n  _meta {\n    block {\n      number\n    }\n  }\n  owned: domainConnection(\n    first: $first\n    after: $after\n    where: {owner: $address, includeUnreachable: $includeUnreachable}\n  ) {\n    edges {\n      node {\n        ...V2IndexedNameFields\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}\n\nfragment V2IndexedNameFields on Domain {\n  id\n  protocol\n  name\n  labelName\n  labelhash\n  parent {\n    id\n    subregistry {\n      address\n    }\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n  subregistry {\n    address\n  }\n  canonicalId\n  tokenId\n  tokenVersion\n  registrationDate\n  gracePeriodEnd\n  unreachableSince\n  isNormalized\n  isReachable\n  isWrapped\n  roleHolderCount\n}" as TypedDocumentString<
    V2GetOwnedNamesQuery,
    V2GetOwnedNamesQueryVariables
  >;
export const V2GetResolvedNamesDocument =
  "query V2GetResolvedNames($address: String!, $first: Int!, $after: String, $includeUnreachable: Boolean) {\n  _meta {\n    block {\n      number\n    }\n  }\n  resolved: domainConnection(\n    first: $first\n    after: $after\n    where: {resolvedAddress: $address, includeUnreachable: $includeUnreachable}\n  ) {\n    edges {\n      node {\n        ...V2IndexedNameFields\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}\n\nfragment V2IndexedNameFields on Domain {\n  id\n  protocol\n  name\n  labelName\n  labelhash\n  parent {\n    id\n    subregistry {\n      address\n    }\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n  subregistry {\n    address\n  }\n  canonicalId\n  tokenId\n  tokenVersion\n  registrationDate\n  gracePeriodEnd\n  unreachableSince\n  isNormalized\n  isReachable\n  isWrapped\n  roleHolderCount\n}" as TypedDocumentString<
    V2GetResolvedNamesQuery,
    V2GetResolvedNamesQueryVariables
  >;
export const V2GetRegistrationsForAddressDocument =
  "query V2GetRegistrationsForAddress($address: String!, $first: Int!, $after: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  registrations: registrationConnection(\n    first: $first\n    after: $after\n    where: {registrant: $address}\n  ) {\n    edges {\n      node {\n        domain {\n          ...V2IndexedNameFields\n        }\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}\n\nfragment V2IndexedNameFields on Domain {\n  id\n  protocol\n  name\n  labelName\n  labelhash\n  parent {\n    id\n    subregistry {\n      address\n    }\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n  subregistry {\n    address\n  }\n  canonicalId\n  tokenId\n  tokenVersion\n  registrationDate\n  gracePeriodEnd\n  unreachableSince\n  isNormalized\n  isReachable\n  isWrapped\n  roleHolderCount\n}" as TypedDocumentString<
    V2GetRegistrationsForAddressQuery,
    V2GetRegistrationsForAddressQueryVariables
  >;
export const V2GetRolesForAddressDocument =
  "query V2GetRolesForAddress($address: String!, $first: Int!, $after: String) {\n  _meta {\n    block {\n      number\n    }\n  }\n  roles: roleConnection(first: $first, after: $after, account: $address) {\n    edges {\n      node {\n        name\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}" as TypedDocumentString<
    V2GetRolesForAddressQuery,
    V2GetRolesForAddressQueryVariables
  >;
