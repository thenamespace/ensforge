import {
  getNameCapabilities,
  getOperatorApproval,
  getRecordPermissions,
  getRegistryCapabilities,
  getRegistryRoles,
  getRequiredAuthorization,
  getResolverCapabilities,
  getResolverDelegateApproval,
  getResolverRoles,
  getTokenApproval,
  getWrapperPermissions,
  getWriteTarget,
  hasRegistryRoles,
  hasResolverRoles,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface CapabilitiesActions {
  readonly getNameCapabilities: BoundAction<typeof getNameCapabilities>;
  readonly getOperatorApproval: BoundAction<typeof getOperatorApproval>;
  readonly getRecordPermissions: BoundAction<typeof getRecordPermissions>;
  readonly getRegistryCapabilities: BoundAction<typeof getRegistryCapabilities>;
  readonly getRegistryRoles: BoundAction<typeof getRegistryRoles>;
  readonly getRequiredAuthorization: BoundAction<typeof getRequiredAuthorization>;
  readonly getResolverCapabilities: BoundAction<typeof getResolverCapabilities>;
  readonly getResolverDelegateApproval: BoundAction<typeof getResolverDelegateApproval>;
  readonly getResolverRoles: BoundAction<typeof getResolverRoles>;
  readonly getTokenApproval: BoundAction<typeof getTokenApproval>;
  readonly getWrapperPermissions: BoundAction<typeof getWrapperPermissions>;
  readonly getWriteTarget: BoundAction<typeof getWriteTarget>;
  readonly hasRegistryRoles: BoundAction<typeof hasRegistryRoles>;
  readonly hasResolverRoles: BoundAction<typeof hasResolverRoles>;
}

export const makeCapabilitiesActions = (config: EnsforgeConfig): CapabilitiesActions =>
  Object.freeze({
    getNameCapabilities: bindAction(config, getNameCapabilities),
    getOperatorApproval: bindAction(config, getOperatorApproval),
    getRecordPermissions: bindAction(config, getRecordPermissions),
    getRegistryCapabilities: bindAction(config, getRegistryCapabilities),
    getRegistryRoles: bindAction(config, getRegistryRoles),
    getRequiredAuthorization: bindAction(config, getRequiredAuthorization),
    getResolverCapabilities: bindAction(config, getResolverCapabilities),
    getResolverDelegateApproval: bindAction(config, getResolverDelegateApproval),
    getResolverRoles: bindAction(config, getResolverRoles),
    getTokenApproval: bindAction(config, getTokenApproval),
    getWrapperPermissions: bindAction(config, getWrapperPermissions),
    getWriteTarget: bindAction(config, getWriteTarget),
    hasRegistryRoles: bindAction(config, hasRegistryRoles),
    hasResolverRoles: bindAction(config, hasResolverRoles),
  });
