/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type Account_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<Account_Filter | null | undefined> | null | undefined;
  readonly domains_?: Domain_Filter | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly or?: ReadonlyArray<Account_Filter | null | undefined> | null | undefined;
  readonly registrations_?: Registration_Filter | null | undefined;
  readonly wrappedDomains_?: WrappedDomain_Filter | null | undefined;
};

export type BlockChangedFilter = {
  readonly number_gte: number;
};

export type DomainEvent_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<DomainEvent_Filter | null | undefined> | null | undefined;
  readonly blockNumber?: number | null | undefined;
  readonly blockNumber_gt?: number | null | undefined;
  readonly blockNumber_gte?: number | null | undefined;
  readonly blockNumber_in?: ReadonlyArray<number> | null | undefined;
  readonly blockNumber_lt?: number | null | undefined;
  readonly blockNumber_lte?: number | null | undefined;
  readonly blockNumber_not?: number | null | undefined;
  readonly blockNumber_not_in?: ReadonlyArray<number> | null | undefined;
  readonly domain?: string | null | undefined;
  readonly domain_?: Domain_Filter | null | undefined;
  readonly domain_contains?: string | null | undefined;
  readonly domain_contains_nocase?: string | null | undefined;
  readonly domain_ends_with?: string | null | undefined;
  readonly domain_ends_with_nocase?: string | null | undefined;
  readonly domain_gt?: string | null | undefined;
  readonly domain_gte?: string | null | undefined;
  readonly domain_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_lt?: string | null | undefined;
  readonly domain_lte?: string | null | undefined;
  readonly domain_not?: string | null | undefined;
  readonly domain_not_contains?: string | null | undefined;
  readonly domain_not_contains_nocase?: string | null | undefined;
  readonly domain_not_ends_with?: string | null | undefined;
  readonly domain_not_ends_with_nocase?: string | null | undefined;
  readonly domain_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_not_starts_with?: string | null | undefined;
  readonly domain_not_starts_with_nocase?: string | null | undefined;
  readonly domain_starts_with?: string | null | undefined;
  readonly domain_starts_with_nocase?: string | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly or?: ReadonlyArray<DomainEvent_Filter | null | undefined> | null | undefined;
  readonly transactionID?: string | null | undefined;
  readonly transactionID_contains?: string | null | undefined;
  readonly transactionID_gt?: string | null | undefined;
  readonly transactionID_gte?: string | null | undefined;
  readonly transactionID_in?: ReadonlyArray<string> | null | undefined;
  readonly transactionID_lt?: string | null | undefined;
  readonly transactionID_lte?: string | null | undefined;
  readonly transactionID_not?: string | null | undefined;
  readonly transactionID_not_contains?: string | null | undefined;
  readonly transactionID_not_in?: ReadonlyArray<string> | null | undefined;
};

export type Domain_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<Domain_Filter | null | undefined> | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly createdAt_gt?: string | null | undefined;
  readonly createdAt_gte?: string | null | undefined;
  readonly createdAt_in?: ReadonlyArray<string> | null | undefined;
  readonly createdAt_lt?: string | null | undefined;
  readonly createdAt_lte?: string | null | undefined;
  readonly createdAt_not?: string | null | undefined;
  readonly createdAt_not_in?: ReadonlyArray<string> | null | undefined;
  readonly events_?: DomainEvent_Filter | null | undefined;
  readonly expiryDate?: string | null | undefined;
  readonly expiryDate_gt?: string | null | undefined;
  readonly expiryDate_gte?: string | null | undefined;
  readonly expiryDate_in?: ReadonlyArray<string> | null | undefined;
  readonly expiryDate_lt?: string | null | undefined;
  readonly expiryDate_lte?: string | null | undefined;
  readonly expiryDate_not?: string | null | undefined;
  readonly expiryDate_not_in?: ReadonlyArray<string> | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly isMigrated?: boolean | null | undefined;
  readonly isMigrated_in?: ReadonlyArray<boolean> | null | undefined;
  readonly isMigrated_not?: boolean | null | undefined;
  readonly isMigrated_not_in?: ReadonlyArray<boolean> | null | undefined;
  readonly labelName?: string | null | undefined;
  readonly labelName_contains?: string | null | undefined;
  readonly labelName_contains_nocase?: string | null | undefined;
  readonly labelName_ends_with?: string | null | undefined;
  readonly labelName_ends_with_nocase?: string | null | undefined;
  readonly labelName_gt?: string | null | undefined;
  readonly labelName_gte?: string | null | undefined;
  readonly labelName_in?: ReadonlyArray<string> | null | undefined;
  readonly labelName_lt?: string | null | undefined;
  readonly labelName_lte?: string | null | undefined;
  readonly labelName_not?: string | null | undefined;
  readonly labelName_not_contains?: string | null | undefined;
  readonly labelName_not_contains_nocase?: string | null | undefined;
  readonly labelName_not_ends_with?: string | null | undefined;
  readonly labelName_not_ends_with_nocase?: string | null | undefined;
  readonly labelName_not_in?: ReadonlyArray<string> | null | undefined;
  readonly labelName_not_starts_with?: string | null | undefined;
  readonly labelName_not_starts_with_nocase?: string | null | undefined;
  readonly labelName_starts_with?: string | null | undefined;
  readonly labelName_starts_with_nocase?: string | null | undefined;
  readonly labelhash?: string | null | undefined;
  readonly labelhash_contains?: string | null | undefined;
  readonly labelhash_gt?: string | null | undefined;
  readonly labelhash_gte?: string | null | undefined;
  readonly labelhash_in?: ReadonlyArray<string> | null | undefined;
  readonly labelhash_lt?: string | null | undefined;
  readonly labelhash_lte?: string | null | undefined;
  readonly labelhash_not?: string | null | undefined;
  readonly labelhash_not_contains?: string | null | undefined;
  readonly labelhash_not_in?: ReadonlyArray<string> | null | undefined;
  readonly name?: string | null | undefined;
  readonly name_contains?: string | null | undefined;
  readonly name_contains_nocase?: string | null | undefined;
  readonly name_ends_with?: string | null | undefined;
  readonly name_ends_with_nocase?: string | null | undefined;
  readonly name_gt?: string | null | undefined;
  readonly name_gte?: string | null | undefined;
  readonly name_in?: ReadonlyArray<string> | null | undefined;
  readonly name_lt?: string | null | undefined;
  readonly name_lte?: string | null | undefined;
  readonly name_not?: string | null | undefined;
  readonly name_not_contains?: string | null | undefined;
  readonly name_not_contains_nocase?: string | null | undefined;
  readonly name_not_ends_with?: string | null | undefined;
  readonly name_not_ends_with_nocase?: string | null | undefined;
  readonly name_not_in?: ReadonlyArray<string> | null | undefined;
  readonly name_not_starts_with?: string | null | undefined;
  readonly name_not_starts_with_nocase?: string | null | undefined;
  readonly name_starts_with?: string | null | undefined;
  readonly name_starts_with_nocase?: string | null | undefined;
  readonly or?: ReadonlyArray<Domain_Filter | null | undefined> | null | undefined;
  readonly owner?: string | null | undefined;
  readonly owner_?: Account_Filter | null | undefined;
  readonly owner_contains?: string | null | undefined;
  readonly owner_contains_nocase?: string | null | undefined;
  readonly owner_ends_with?: string | null | undefined;
  readonly owner_ends_with_nocase?: string | null | undefined;
  readonly owner_gt?: string | null | undefined;
  readonly owner_gte?: string | null | undefined;
  readonly owner_in?: ReadonlyArray<string> | null | undefined;
  readonly owner_lt?: string | null | undefined;
  readonly owner_lte?: string | null | undefined;
  readonly owner_not?: string | null | undefined;
  readonly owner_not_contains?: string | null | undefined;
  readonly owner_not_contains_nocase?: string | null | undefined;
  readonly owner_not_ends_with?: string | null | undefined;
  readonly owner_not_ends_with_nocase?: string | null | undefined;
  readonly owner_not_in?: ReadonlyArray<string> | null | undefined;
  readonly owner_not_starts_with?: string | null | undefined;
  readonly owner_not_starts_with_nocase?: string | null | undefined;
  readonly owner_starts_with?: string | null | undefined;
  readonly owner_starts_with_nocase?: string | null | undefined;
  readonly parent?: string | null | undefined;
  readonly parent_?: Domain_Filter | null | undefined;
  readonly parent_contains?: string | null | undefined;
  readonly parent_contains_nocase?: string | null | undefined;
  readonly parent_ends_with?: string | null | undefined;
  readonly parent_ends_with_nocase?: string | null | undefined;
  readonly parent_gt?: string | null | undefined;
  readonly parent_gte?: string | null | undefined;
  readonly parent_in?: ReadonlyArray<string> | null | undefined;
  readonly parent_lt?: string | null | undefined;
  readonly parent_lte?: string | null | undefined;
  readonly parent_not?: string | null | undefined;
  readonly parent_not_contains?: string | null | undefined;
  readonly parent_not_contains_nocase?: string | null | undefined;
  readonly parent_not_ends_with?: string | null | undefined;
  readonly parent_not_ends_with_nocase?: string | null | undefined;
  readonly parent_not_in?: ReadonlyArray<string> | null | undefined;
  readonly parent_not_starts_with?: string | null | undefined;
  readonly parent_not_starts_with_nocase?: string | null | undefined;
  readonly parent_starts_with?: string | null | undefined;
  readonly parent_starts_with_nocase?: string | null | undefined;
  readonly registrant?: string | null | undefined;
  readonly registrant_?: Account_Filter | null | undefined;
  readonly registrant_contains?: string | null | undefined;
  readonly registrant_contains_nocase?: string | null | undefined;
  readonly registrant_ends_with?: string | null | undefined;
  readonly registrant_ends_with_nocase?: string | null | undefined;
  readonly registrant_gt?: string | null | undefined;
  readonly registrant_gte?: string | null | undefined;
  readonly registrant_in?: ReadonlyArray<string> | null | undefined;
  readonly registrant_lt?: string | null | undefined;
  readonly registrant_lte?: string | null | undefined;
  readonly registrant_not?: string | null | undefined;
  readonly registrant_not_contains?: string | null | undefined;
  readonly registrant_not_contains_nocase?: string | null | undefined;
  readonly registrant_not_ends_with?: string | null | undefined;
  readonly registrant_not_ends_with_nocase?: string | null | undefined;
  readonly registrant_not_in?: ReadonlyArray<string> | null | undefined;
  readonly registrant_not_starts_with?: string | null | undefined;
  readonly registrant_not_starts_with_nocase?: string | null | undefined;
  readonly registrant_starts_with?: string | null | undefined;
  readonly registrant_starts_with_nocase?: string | null | undefined;
  readonly registration_?: Registration_Filter | null | undefined;
  readonly resolvedAddress?: string | null | undefined;
  readonly resolvedAddress_?: Account_Filter | null | undefined;
  readonly resolvedAddress_contains?: string | null | undefined;
  readonly resolvedAddress_contains_nocase?: string | null | undefined;
  readonly resolvedAddress_ends_with?: string | null | undefined;
  readonly resolvedAddress_ends_with_nocase?: string | null | undefined;
  readonly resolvedAddress_gt?: string | null | undefined;
  readonly resolvedAddress_gte?: string | null | undefined;
  readonly resolvedAddress_in?: ReadonlyArray<string> | null | undefined;
  readonly resolvedAddress_lt?: string | null | undefined;
  readonly resolvedAddress_lte?: string | null | undefined;
  readonly resolvedAddress_not?: string | null | undefined;
  readonly resolvedAddress_not_contains?: string | null | undefined;
  readonly resolvedAddress_not_contains_nocase?: string | null | undefined;
  readonly resolvedAddress_not_ends_with?: string | null | undefined;
  readonly resolvedAddress_not_ends_with_nocase?: string | null | undefined;
  readonly resolvedAddress_not_in?: ReadonlyArray<string> | null | undefined;
  readonly resolvedAddress_not_starts_with?: string | null | undefined;
  readonly resolvedAddress_not_starts_with_nocase?: string | null | undefined;
  readonly resolvedAddress_starts_with?: string | null | undefined;
  readonly resolvedAddress_starts_with_nocase?: string | null | undefined;
  readonly resolver?: string | null | undefined;
  readonly resolver_?: Resolver_Filter | null | undefined;
  readonly resolver_contains?: string | null | undefined;
  readonly resolver_contains_nocase?: string | null | undefined;
  readonly resolver_ends_with?: string | null | undefined;
  readonly resolver_ends_with_nocase?: string | null | undefined;
  readonly resolver_gt?: string | null | undefined;
  readonly resolver_gte?: string | null | undefined;
  readonly resolver_in?: ReadonlyArray<string> | null | undefined;
  readonly resolver_lt?: string | null | undefined;
  readonly resolver_lte?: string | null | undefined;
  readonly resolver_not?: string | null | undefined;
  readonly resolver_not_contains?: string | null | undefined;
  readonly resolver_not_contains_nocase?: string | null | undefined;
  readonly resolver_not_ends_with?: string | null | undefined;
  readonly resolver_not_ends_with_nocase?: string | null | undefined;
  readonly resolver_not_in?: ReadonlyArray<string> | null | undefined;
  readonly resolver_not_starts_with?: string | null | undefined;
  readonly resolver_not_starts_with_nocase?: string | null | undefined;
  readonly resolver_starts_with?: string | null | undefined;
  readonly resolver_starts_with_nocase?: string | null | undefined;
  readonly subdomainCount?: number | null | undefined;
  readonly subdomainCount_gt?: number | null | undefined;
  readonly subdomainCount_gte?: number | null | undefined;
  readonly subdomainCount_in?: ReadonlyArray<number> | null | undefined;
  readonly subdomainCount_lt?: number | null | undefined;
  readonly subdomainCount_lte?: number | null | undefined;
  readonly subdomainCount_not?: number | null | undefined;
  readonly subdomainCount_not_in?: ReadonlyArray<number> | null | undefined;
  readonly subdomains_?: Domain_Filter | null | undefined;
  readonly ttl?: string | null | undefined;
  readonly ttl_gt?: string | null | undefined;
  readonly ttl_gte?: string | null | undefined;
  readonly ttl_in?: ReadonlyArray<string> | null | undefined;
  readonly ttl_lt?: string | null | undefined;
  readonly ttl_lte?: string | null | undefined;
  readonly ttl_not?: string | null | undefined;
  readonly ttl_not_in?: ReadonlyArray<string> | null | undefined;
  readonly wrappedDomain_?: WrappedDomain_Filter | null | undefined;
  readonly wrappedOwner?: string | null | undefined;
  readonly wrappedOwner_?: Account_Filter | null | undefined;
  readonly wrappedOwner_contains?: string | null | undefined;
  readonly wrappedOwner_contains_nocase?: string | null | undefined;
  readonly wrappedOwner_ends_with?: string | null | undefined;
  readonly wrappedOwner_ends_with_nocase?: string | null | undefined;
  readonly wrappedOwner_gt?: string | null | undefined;
  readonly wrappedOwner_gte?: string | null | undefined;
  readonly wrappedOwner_in?: ReadonlyArray<string> | null | undefined;
  readonly wrappedOwner_lt?: string | null | undefined;
  readonly wrappedOwner_lte?: string | null | undefined;
  readonly wrappedOwner_not?: string | null | undefined;
  readonly wrappedOwner_not_contains?: string | null | undefined;
  readonly wrappedOwner_not_contains_nocase?: string | null | undefined;
  readonly wrappedOwner_not_ends_with?: string | null | undefined;
  readonly wrappedOwner_not_ends_with_nocase?: string | null | undefined;
  readonly wrappedOwner_not_in?: ReadonlyArray<string> | null | undefined;
  readonly wrappedOwner_not_starts_with?: string | null | undefined;
  readonly wrappedOwner_not_starts_with_nocase?: string | null | undefined;
  readonly wrappedOwner_starts_with?: string | null | undefined;
  readonly wrappedOwner_starts_with_nocase?: string | null | undefined;
};

export type Domain_OrderBy =
  | "createdAt"
  | "events"
  | "expiryDate"
  | "id"
  | "isMigrated"
  | "labelName"
  | "labelhash"
  | "name"
  | "owner"
  | "owner__id"
  | "parent"
  | "parent__createdAt"
  | "parent__expiryDate"
  | "parent__id"
  | "parent__isMigrated"
  | "parent__labelName"
  | "parent__labelhash"
  | "parent__name"
  | "parent__subdomainCount"
  | "parent__ttl"
  | "registrant"
  | "registrant__id"
  | "registration"
  | "registration__cost"
  | "registration__expiryDate"
  | "registration__id"
  | "registration__labelName"
  | "registration__registrationDate"
  | "resolvedAddress"
  | "resolvedAddress__id"
  | "resolver"
  | "resolver__address"
  | "resolver__contentHash"
  | "resolver__id"
  | "subdomainCount"
  | "subdomains"
  | "ttl"
  | "wrappedDomain"
  | "wrappedDomain__expiryDate"
  | "wrappedDomain__fuses"
  | "wrappedDomain__id"
  | "wrappedDomain__name"
  | "wrappedOwner"
  | "wrappedOwner__id";

/** Defines the order direction, either ascending or descending */
export type OrderDirection = "asc" | "desc";

export type RegistrationEvent_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<RegistrationEvent_Filter | null | undefined> | null | undefined;
  readonly blockNumber?: number | null | undefined;
  readonly blockNumber_gt?: number | null | undefined;
  readonly blockNumber_gte?: number | null | undefined;
  readonly blockNumber_in?: ReadonlyArray<number> | null | undefined;
  readonly blockNumber_lt?: number | null | undefined;
  readonly blockNumber_lte?: number | null | undefined;
  readonly blockNumber_not?: number | null | undefined;
  readonly blockNumber_not_in?: ReadonlyArray<number> | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly or?: ReadonlyArray<RegistrationEvent_Filter | null | undefined> | null | undefined;
  readonly registration?: string | null | undefined;
  readonly registration_?: Registration_Filter | null | undefined;
  readonly registration_contains?: string | null | undefined;
  readonly registration_contains_nocase?: string | null | undefined;
  readonly registration_ends_with?: string | null | undefined;
  readonly registration_ends_with_nocase?: string | null | undefined;
  readonly registration_gt?: string | null | undefined;
  readonly registration_gte?: string | null | undefined;
  readonly registration_in?: ReadonlyArray<string> | null | undefined;
  readonly registration_lt?: string | null | undefined;
  readonly registration_lte?: string | null | undefined;
  readonly registration_not?: string | null | undefined;
  readonly registration_not_contains?: string | null | undefined;
  readonly registration_not_contains_nocase?: string | null | undefined;
  readonly registration_not_ends_with?: string | null | undefined;
  readonly registration_not_ends_with_nocase?: string | null | undefined;
  readonly registration_not_in?: ReadonlyArray<string> | null | undefined;
  readonly registration_not_starts_with?: string | null | undefined;
  readonly registration_not_starts_with_nocase?: string | null | undefined;
  readonly registration_starts_with?: string | null | undefined;
  readonly registration_starts_with_nocase?: string | null | undefined;
  readonly transactionID?: string | null | undefined;
  readonly transactionID_contains?: string | null | undefined;
  readonly transactionID_gt?: string | null | undefined;
  readonly transactionID_gte?: string | null | undefined;
  readonly transactionID_in?: ReadonlyArray<string> | null | undefined;
  readonly transactionID_lt?: string | null | undefined;
  readonly transactionID_lte?: string | null | undefined;
  readonly transactionID_not?: string | null | undefined;
  readonly transactionID_not_contains?: string | null | undefined;
  readonly transactionID_not_in?: ReadonlyArray<string> | null | undefined;
};

export type Registration_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<Registration_Filter | null | undefined> | null | undefined;
  readonly cost?: string | null | undefined;
  readonly cost_gt?: string | null | undefined;
  readonly cost_gte?: string | null | undefined;
  readonly cost_in?: ReadonlyArray<string> | null | undefined;
  readonly cost_lt?: string | null | undefined;
  readonly cost_lte?: string | null | undefined;
  readonly cost_not?: string | null | undefined;
  readonly cost_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain?: string | null | undefined;
  readonly domain_?: Domain_Filter | null | undefined;
  readonly domain_contains?: string | null | undefined;
  readonly domain_contains_nocase?: string | null | undefined;
  readonly domain_ends_with?: string | null | undefined;
  readonly domain_ends_with_nocase?: string | null | undefined;
  readonly domain_gt?: string | null | undefined;
  readonly domain_gte?: string | null | undefined;
  readonly domain_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_lt?: string | null | undefined;
  readonly domain_lte?: string | null | undefined;
  readonly domain_not?: string | null | undefined;
  readonly domain_not_contains?: string | null | undefined;
  readonly domain_not_contains_nocase?: string | null | undefined;
  readonly domain_not_ends_with?: string | null | undefined;
  readonly domain_not_ends_with_nocase?: string | null | undefined;
  readonly domain_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_not_starts_with?: string | null | undefined;
  readonly domain_not_starts_with_nocase?: string | null | undefined;
  readonly domain_starts_with?: string | null | undefined;
  readonly domain_starts_with_nocase?: string | null | undefined;
  readonly events_?: RegistrationEvent_Filter | null | undefined;
  readonly expiryDate?: string | null | undefined;
  readonly expiryDate_gt?: string | null | undefined;
  readonly expiryDate_gte?: string | null | undefined;
  readonly expiryDate_in?: ReadonlyArray<string> | null | undefined;
  readonly expiryDate_lt?: string | null | undefined;
  readonly expiryDate_lte?: string | null | undefined;
  readonly expiryDate_not?: string | null | undefined;
  readonly expiryDate_not_in?: ReadonlyArray<string> | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly labelName?: string | null | undefined;
  readonly labelName_contains?: string | null | undefined;
  readonly labelName_contains_nocase?: string | null | undefined;
  readonly labelName_ends_with?: string | null | undefined;
  readonly labelName_ends_with_nocase?: string | null | undefined;
  readonly labelName_gt?: string | null | undefined;
  readonly labelName_gte?: string | null | undefined;
  readonly labelName_in?: ReadonlyArray<string> | null | undefined;
  readonly labelName_lt?: string | null | undefined;
  readonly labelName_lte?: string | null | undefined;
  readonly labelName_not?: string | null | undefined;
  readonly labelName_not_contains?: string | null | undefined;
  readonly labelName_not_contains_nocase?: string | null | undefined;
  readonly labelName_not_ends_with?: string | null | undefined;
  readonly labelName_not_ends_with_nocase?: string | null | undefined;
  readonly labelName_not_in?: ReadonlyArray<string> | null | undefined;
  readonly labelName_not_starts_with?: string | null | undefined;
  readonly labelName_not_starts_with_nocase?: string | null | undefined;
  readonly labelName_starts_with?: string | null | undefined;
  readonly labelName_starts_with_nocase?: string | null | undefined;
  readonly or?: ReadonlyArray<Registration_Filter | null | undefined> | null | undefined;
  readonly registrant?: string | null | undefined;
  readonly registrant_?: Account_Filter | null | undefined;
  readonly registrant_contains?: string | null | undefined;
  readonly registrant_contains_nocase?: string | null | undefined;
  readonly registrant_ends_with?: string | null | undefined;
  readonly registrant_ends_with_nocase?: string | null | undefined;
  readonly registrant_gt?: string | null | undefined;
  readonly registrant_gte?: string | null | undefined;
  readonly registrant_in?: ReadonlyArray<string> | null | undefined;
  readonly registrant_lt?: string | null | undefined;
  readonly registrant_lte?: string | null | undefined;
  readonly registrant_not?: string | null | undefined;
  readonly registrant_not_contains?: string | null | undefined;
  readonly registrant_not_contains_nocase?: string | null | undefined;
  readonly registrant_not_ends_with?: string | null | undefined;
  readonly registrant_not_ends_with_nocase?: string | null | undefined;
  readonly registrant_not_in?: ReadonlyArray<string> | null | undefined;
  readonly registrant_not_starts_with?: string | null | undefined;
  readonly registrant_not_starts_with_nocase?: string | null | undefined;
  readonly registrant_starts_with?: string | null | undefined;
  readonly registrant_starts_with_nocase?: string | null | undefined;
  readonly registrationDate?: string | null | undefined;
  readonly registrationDate_gt?: string | null | undefined;
  readonly registrationDate_gte?: string | null | undefined;
  readonly registrationDate_in?: ReadonlyArray<string> | null | undefined;
  readonly registrationDate_lt?: string | null | undefined;
  readonly registrationDate_lte?: string | null | undefined;
  readonly registrationDate_not?: string | null | undefined;
  readonly registrationDate_not_in?: ReadonlyArray<string> | null | undefined;
};

export type ResolverEvent_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<ResolverEvent_Filter | null | undefined> | null | undefined;
  readonly blockNumber?: number | null | undefined;
  readonly blockNumber_gt?: number | null | undefined;
  readonly blockNumber_gte?: number | null | undefined;
  readonly blockNumber_in?: ReadonlyArray<number> | null | undefined;
  readonly blockNumber_lt?: number | null | undefined;
  readonly blockNumber_lte?: number | null | undefined;
  readonly blockNumber_not?: number | null | undefined;
  readonly blockNumber_not_in?: ReadonlyArray<number> | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly or?: ReadonlyArray<ResolverEvent_Filter | null | undefined> | null | undefined;
  readonly resolver?: string | null | undefined;
  readonly resolver_?: Resolver_Filter | null | undefined;
  readonly resolver_contains?: string | null | undefined;
  readonly resolver_contains_nocase?: string | null | undefined;
  readonly resolver_ends_with?: string | null | undefined;
  readonly resolver_ends_with_nocase?: string | null | undefined;
  readonly resolver_gt?: string | null | undefined;
  readonly resolver_gte?: string | null | undefined;
  readonly resolver_in?: ReadonlyArray<string> | null | undefined;
  readonly resolver_lt?: string | null | undefined;
  readonly resolver_lte?: string | null | undefined;
  readonly resolver_not?: string | null | undefined;
  readonly resolver_not_contains?: string | null | undefined;
  readonly resolver_not_contains_nocase?: string | null | undefined;
  readonly resolver_not_ends_with?: string | null | undefined;
  readonly resolver_not_ends_with_nocase?: string | null | undefined;
  readonly resolver_not_in?: ReadonlyArray<string> | null | undefined;
  readonly resolver_not_starts_with?: string | null | undefined;
  readonly resolver_not_starts_with_nocase?: string | null | undefined;
  readonly resolver_starts_with?: string | null | undefined;
  readonly resolver_starts_with_nocase?: string | null | undefined;
  readonly transactionID?: string | null | undefined;
  readonly transactionID_contains?: string | null | undefined;
  readonly transactionID_gt?: string | null | undefined;
  readonly transactionID_gte?: string | null | undefined;
  readonly transactionID_in?: ReadonlyArray<string> | null | undefined;
  readonly transactionID_lt?: string | null | undefined;
  readonly transactionID_lte?: string | null | undefined;
  readonly transactionID_not?: string | null | undefined;
  readonly transactionID_not_contains?: string | null | undefined;
  readonly transactionID_not_in?: ReadonlyArray<string> | null | undefined;
};

export type Resolver_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly addr?: string | null | undefined;
  readonly addr_?: Account_Filter | null | undefined;
  readonly addr_contains?: string | null | undefined;
  readonly addr_contains_nocase?: string | null | undefined;
  readonly addr_ends_with?: string | null | undefined;
  readonly addr_ends_with_nocase?: string | null | undefined;
  readonly addr_gt?: string | null | undefined;
  readonly addr_gte?: string | null | undefined;
  readonly addr_in?: ReadonlyArray<string> | null | undefined;
  readonly addr_lt?: string | null | undefined;
  readonly addr_lte?: string | null | undefined;
  readonly addr_not?: string | null | undefined;
  readonly addr_not_contains?: string | null | undefined;
  readonly addr_not_contains_nocase?: string | null | undefined;
  readonly addr_not_ends_with?: string | null | undefined;
  readonly addr_not_ends_with_nocase?: string | null | undefined;
  readonly addr_not_in?: ReadonlyArray<string> | null | undefined;
  readonly addr_not_starts_with?: string | null | undefined;
  readonly addr_not_starts_with_nocase?: string | null | undefined;
  readonly addr_starts_with?: string | null | undefined;
  readonly addr_starts_with_nocase?: string | null | undefined;
  readonly address?: string | null | undefined;
  readonly address_contains?: string | null | undefined;
  readonly address_gt?: string | null | undefined;
  readonly address_gte?: string | null | undefined;
  readonly address_in?: ReadonlyArray<string> | null | undefined;
  readonly address_lt?: string | null | undefined;
  readonly address_lte?: string | null | undefined;
  readonly address_not?: string | null | undefined;
  readonly address_not_contains?: string | null | undefined;
  readonly address_not_in?: ReadonlyArray<string> | null | undefined;
  readonly and?: ReadonlyArray<Resolver_Filter | null | undefined> | null | undefined;
  readonly coinTypes?: ReadonlyArray<string> | null | undefined;
  readonly coinTypes_contains?: ReadonlyArray<string> | null | undefined;
  readonly coinTypes_not?: ReadonlyArray<string> | null | undefined;
  readonly coinTypes_not_contains?: ReadonlyArray<string> | null | undefined;
  readonly contentHash?: string | null | undefined;
  readonly contentHash_contains?: string | null | undefined;
  readonly contentHash_gt?: string | null | undefined;
  readonly contentHash_gte?: string | null | undefined;
  readonly contentHash_in?: ReadonlyArray<string> | null | undefined;
  readonly contentHash_lt?: string | null | undefined;
  readonly contentHash_lte?: string | null | undefined;
  readonly contentHash_not?: string | null | undefined;
  readonly contentHash_not_contains?: string | null | undefined;
  readonly contentHash_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain?: string | null | undefined;
  readonly domain_?: Domain_Filter | null | undefined;
  readonly domain_contains?: string | null | undefined;
  readonly domain_contains_nocase?: string | null | undefined;
  readonly domain_ends_with?: string | null | undefined;
  readonly domain_ends_with_nocase?: string | null | undefined;
  readonly domain_gt?: string | null | undefined;
  readonly domain_gte?: string | null | undefined;
  readonly domain_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_lt?: string | null | undefined;
  readonly domain_lte?: string | null | undefined;
  readonly domain_not?: string | null | undefined;
  readonly domain_not_contains?: string | null | undefined;
  readonly domain_not_contains_nocase?: string | null | undefined;
  readonly domain_not_ends_with?: string | null | undefined;
  readonly domain_not_ends_with_nocase?: string | null | undefined;
  readonly domain_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_not_starts_with?: string | null | undefined;
  readonly domain_not_starts_with_nocase?: string | null | undefined;
  readonly domain_starts_with?: string | null | undefined;
  readonly domain_starts_with_nocase?: string | null | undefined;
  readonly events_?: ResolverEvent_Filter | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly or?: ReadonlyArray<Resolver_Filter | null | undefined> | null | undefined;
  readonly texts?: ReadonlyArray<string> | null | undefined;
  readonly texts_contains?: ReadonlyArray<string> | null | undefined;
  readonly texts_contains_nocase?: ReadonlyArray<string> | null | undefined;
  readonly texts_not?: ReadonlyArray<string> | null | undefined;
  readonly texts_not_contains?: ReadonlyArray<string> | null | undefined;
  readonly texts_not_contains_nocase?: ReadonlyArray<string> | null | undefined;
};

export type WrappedDomain_Filter = {
  /** Filter for the block changed event. */
  readonly _change_block?: BlockChangedFilter | null | undefined;
  readonly and?: ReadonlyArray<WrappedDomain_Filter | null | undefined> | null | undefined;
  readonly domain?: string | null | undefined;
  readonly domain_?: Domain_Filter | null | undefined;
  readonly domain_contains?: string | null | undefined;
  readonly domain_contains_nocase?: string | null | undefined;
  readonly domain_ends_with?: string | null | undefined;
  readonly domain_ends_with_nocase?: string | null | undefined;
  readonly domain_gt?: string | null | undefined;
  readonly domain_gte?: string | null | undefined;
  readonly domain_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_lt?: string | null | undefined;
  readonly domain_lte?: string | null | undefined;
  readonly domain_not?: string | null | undefined;
  readonly domain_not_contains?: string | null | undefined;
  readonly domain_not_contains_nocase?: string | null | undefined;
  readonly domain_not_ends_with?: string | null | undefined;
  readonly domain_not_ends_with_nocase?: string | null | undefined;
  readonly domain_not_in?: ReadonlyArray<string> | null | undefined;
  readonly domain_not_starts_with?: string | null | undefined;
  readonly domain_not_starts_with_nocase?: string | null | undefined;
  readonly domain_starts_with?: string | null | undefined;
  readonly domain_starts_with_nocase?: string | null | undefined;
  readonly expiryDate?: string | null | undefined;
  readonly expiryDate_gt?: string | null | undefined;
  readonly expiryDate_gte?: string | null | undefined;
  readonly expiryDate_in?: ReadonlyArray<string> | null | undefined;
  readonly expiryDate_lt?: string | null | undefined;
  readonly expiryDate_lte?: string | null | undefined;
  readonly expiryDate_not?: string | null | undefined;
  readonly expiryDate_not_in?: ReadonlyArray<string> | null | undefined;
  readonly fuses?: number | null | undefined;
  readonly fuses_gt?: number | null | undefined;
  readonly fuses_gte?: number | null | undefined;
  readonly fuses_in?: ReadonlyArray<number> | null | undefined;
  readonly fuses_lt?: number | null | undefined;
  readonly fuses_lte?: number | null | undefined;
  readonly fuses_not?: number | null | undefined;
  readonly fuses_not_in?: ReadonlyArray<number> | null | undefined;
  readonly id?: string | number | null | undefined;
  readonly id_gt?: string | number | null | undefined;
  readonly id_gte?: string | number | null | undefined;
  readonly id_in?: ReadonlyArray<string | number> | null | undefined;
  readonly id_lt?: string | number | null | undefined;
  readonly id_lte?: string | number | null | undefined;
  readonly id_not?: string | number | null | undefined;
  readonly id_not_in?: ReadonlyArray<string | number> | null | undefined;
  readonly name?: string | null | undefined;
  readonly name_contains?: string | null | undefined;
  readonly name_contains_nocase?: string | null | undefined;
  readonly name_ends_with?: string | null | undefined;
  readonly name_ends_with_nocase?: string | null | undefined;
  readonly name_gt?: string | null | undefined;
  readonly name_gte?: string | null | undefined;
  readonly name_in?: ReadonlyArray<string> | null | undefined;
  readonly name_lt?: string | null | undefined;
  readonly name_lte?: string | null | undefined;
  readonly name_not?: string | null | undefined;
  readonly name_not_contains?: string | null | undefined;
  readonly name_not_contains_nocase?: string | null | undefined;
  readonly name_not_ends_with?: string | null | undefined;
  readonly name_not_ends_with_nocase?: string | null | undefined;
  readonly name_not_in?: ReadonlyArray<string> | null | undefined;
  readonly name_not_starts_with?: string | null | undefined;
  readonly name_not_starts_with_nocase?: string | null | undefined;
  readonly name_starts_with?: string | null | undefined;
  readonly name_starts_with_nocase?: string | null | undefined;
  readonly or?: ReadonlyArray<WrappedDomain_Filter | null | undefined> | null | undefined;
  readonly owner?: string | null | undefined;
  readonly owner_?: Account_Filter | null | undefined;
  readonly owner_contains?: string | null | undefined;
  readonly owner_contains_nocase?: string | null | undefined;
  readonly owner_ends_with?: string | null | undefined;
  readonly owner_ends_with_nocase?: string | null | undefined;
  readonly owner_gt?: string | null | undefined;
  readonly owner_gte?: string | null | undefined;
  readonly owner_in?: ReadonlyArray<string> | null | undefined;
  readonly owner_lt?: string | null | undefined;
  readonly owner_lte?: string | null | undefined;
  readonly owner_not?: string | null | undefined;
  readonly owner_not_contains?: string | null | undefined;
  readonly owner_not_contains_nocase?: string | null | undefined;
  readonly owner_not_ends_with?: string | null | undefined;
  readonly owner_not_ends_with_nocase?: string | null | undefined;
  readonly owner_not_in?: ReadonlyArray<string> | null | undefined;
  readonly owner_not_starts_with?: string | null | undefined;
  readonly owner_not_starts_with_nocase?: string | null | undefined;
  readonly owner_starts_with?: string | null | undefined;
  readonly owner_starts_with_nocase?: string | null | undefined;
};

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

export type V1GetSubnamesQueryVariables = Exact<{
  id: string | number;
  first: number;
  where?: Domain_Filter | null | undefined;
  orderBy: Domain_OrderBy;
  orderDirection: OrderDirection;
}>;

export type V1GetSubnamesQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly domain: {
    readonly subdomains: ReadonlyArray<{
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
    }>;
  } | null;
};

export const V1GetSubnamesDocument =
  "query V1GetSubnames($id: ID!, $first: Int!, $where: Domain_filter, $orderBy: Domain_orderBy!, $orderDirection: OrderDirection!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domain(id: $id) {\n    subdomains(\n      first: $first\n      where: $where\n      orderBy: $orderBy\n      orderDirection: $orderDirection\n    ) {\n      ...V1IndexedNameFields\n    }\n  }\n}\n\nfragment V1IndexedNameFields on Domain {\n  id\n  name\n  labelName\n  labelhash\n  parent {\n    id\n  }\n  owner {\n    id\n  }\n  registrant {\n    id\n  }\n  resolvedAddress {\n    id\n  }\n  resolver {\n    address\n  }\n  createdAt\n  expiryDate\n  subdomainCount\n  isMigrated\n  ttl\n  registration {\n    registrant {\n      id\n    }\n    registrationDate\n    expiryDate\n  }\n  wrappedOwner {\n    id\n  }\n  wrappedDomain {\n    owner {\n      id\n    }\n    fuses\n    expiryDate\n  }\n}" as TypedDocumentString<
    V1GetSubnamesQuery,
    V1GetSubnamesQueryVariables
  >;
