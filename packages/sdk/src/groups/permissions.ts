import {
  approveName,
  clearNameApproval,
  grantRegistryRoles,
  grantResolverRoles,
  grantResolverRootRoles,
  revokeRegistryRoles,
  revokeResolverRoles,
  revokeResolverRootRoles,
  setOperatorApproval,
  setRecordPermissions,
  setResolverDelegateApproval,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface PermissionsActions {
  readonly approveName: BoundAction<typeof approveName>;
  readonly clearNameApproval: BoundAction<typeof clearNameApproval>;
  readonly grantRegistryRoles: BoundAction<typeof grantRegistryRoles>;
  readonly grantResolverRoles: BoundAction<typeof grantResolverRoles>;
  readonly grantResolverRootRoles: BoundAction<typeof grantResolverRootRoles>;
  readonly revokeRegistryRoles: BoundAction<typeof revokeRegistryRoles>;
  readonly revokeResolverRoles: BoundAction<typeof revokeResolverRoles>;
  readonly revokeResolverRootRoles: BoundAction<typeof revokeResolverRootRoles>;
  readonly setOperatorApproval: BoundAction<typeof setOperatorApproval>;
  readonly setRecordPermissions: BoundAction<typeof setRecordPermissions>;
  readonly setResolverDelegateApproval: BoundAction<typeof setResolverDelegateApproval>;
}

export const makePermissionsActions = (config: EnsforgeConfig): PermissionsActions =>
  Object.freeze({
    approveName: bindAction(config, approveName),
    clearNameApproval: bindAction(config, clearNameApproval),
    grantRegistryRoles: bindAction(config, grantRegistryRoles),
    grantResolverRoles: bindAction(config, grantResolverRoles),
    grantResolverRootRoles: bindAction(config, grantResolverRootRoles),
    revokeRegistryRoles: bindAction(config, revokeRegistryRoles),
    revokeResolverRoles: bindAction(config, revokeResolverRoles),
    revokeResolverRootRoles: bindAction(config, revokeResolverRootRoles),
    setOperatorApproval: bindAction(config, setOperatorApproval),
    setRecordPermissions: bindAction(config, setRecordPermissions),
    setResolverDelegateApproval: bindAction(config, setResolverDelegateApproval),
  });
