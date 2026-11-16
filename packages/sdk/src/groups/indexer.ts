import type { EnsforgeConfig } from "@ensforge/core/legacy";
import {
  getDecodedName,
  getEvents,
  getIndexedName,
  getIndexedRecords,
  getIndexedResolver,
  getIndexerStatus,
  getNameHistory,
  getNames,
  getNamesForAddress,
  getRecordHistory,
  getRegistrations,
  getRegistrationsForAddress,
  getRegistrationHistory,
  getRegistriesForAddress,
  getRegistry,
  getRegistryLabels,
  getRegistryRoles,
  getResolvedNamesForAddress,
  getResolverApprovals,
  getResolverMetadata,
  getResolversForAddress,
  getSubnames,
  searchNames,
} from "@ensforge/core/legacy/indexer";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface IndexerActions {
  readonly getDecodedName: BoundAction<typeof getDecodedName>;
  readonly getEvents: BoundAction<typeof getEvents>;
  readonly getIndexedName: BoundAction<typeof getIndexedName>;
  readonly getIndexedRecords: BoundAction<typeof getIndexedRecords>;
  readonly getIndexedResolver: BoundAction<typeof getIndexedResolver>;
  readonly getIndexerStatus: BoundAction<typeof getIndexerStatus>;
  readonly getNameHistory: BoundAction<typeof getNameHistory>;
  readonly getNames: BoundAction<typeof getNames>;
  readonly getNamesForAddress: BoundAction<typeof getNamesForAddress>;
  readonly getRecordHistory: BoundAction<typeof getRecordHistory>;
  readonly getRegistrations: BoundAction<typeof getRegistrations>;
  readonly getRegistrationsForAddress: BoundAction<typeof getRegistrationsForAddress>;
  readonly getRegistrationHistory: BoundAction<typeof getRegistrationHistory>;
  readonly getRegistriesForAddress: BoundAction<typeof getRegistriesForAddress>;
  readonly getRegistry: BoundAction<typeof getRegistry>;
  readonly getRegistryLabels: BoundAction<typeof getRegistryLabels>;
  readonly getRegistryRoles: BoundAction<typeof getRegistryRoles>;
  readonly getResolvedNamesForAddress: BoundAction<typeof getResolvedNamesForAddress>;
  readonly getResolverApprovals: BoundAction<typeof getResolverApprovals>;
  readonly getResolverMetadata: BoundAction<typeof getResolverMetadata>;
  readonly getResolversForAddress: BoundAction<typeof getResolversForAddress>;
  readonly getSubnames: BoundAction<typeof getSubnames>;
  readonly searchNames: BoundAction<typeof searchNames>;
}

export const makeIndexerActions = (config: EnsforgeConfig): IndexerActions =>
  Object.freeze({
    getDecodedName: bindAction(config, getDecodedName),
    getEvents: bindAction(config, getEvents),
    getIndexedName: bindAction(config, getIndexedName),
    getIndexedRecords: bindAction(config, getIndexedRecords),
    getIndexedResolver: bindAction(config, getIndexedResolver),
    getIndexerStatus: bindAction(config, getIndexerStatus),
    getNameHistory: bindAction(config, getNameHistory),
    getNames: bindAction(config, getNames),
    getNamesForAddress: bindAction(config, getNamesForAddress),
    getRecordHistory: bindAction(config, getRecordHistory),
    getRegistrations: bindAction(config, getRegistrations),
    getRegistrationsForAddress: bindAction(config, getRegistrationsForAddress),
    getRegistrationHistory: bindAction(config, getRegistrationHistory),
    getRegistriesForAddress: bindAction(config, getRegistriesForAddress),
    getRegistry: bindAction(config, getRegistry),
    getRegistryLabels: bindAction(config, getRegistryLabels),
    getRegistryRoles: bindAction(config, getRegistryRoles),
    getResolvedNamesForAddress: bindAction(config, getResolvedNamesForAddress),
    getResolverApprovals: bindAction(config, getResolverApprovals),
    getResolverMetadata: bindAction(config, getResolverMetadata),
    getResolversForAddress: bindAction(config, getResolversForAddress),
    getSubnames: bindAction(config, getSubnames),
    searchNames: bindAction(config, searchNames),
  });
