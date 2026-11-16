import type { EnsforgeConfig } from "@ensforge/core/legacy";
import {
  setHcaFactoryImplementationApproval,
  setHcaUpgradeImplementationApproval,
  setTrustedHcaImplementation,
  transferHcaGovernanceOwnership,
  renounceHcaGovernanceOwnership,
  grantTrustedHcaRoles,
  revokeTrustedHcaRoles,
  getHcaGovernanceOwner,
  getTrustedHcaRoles,
} from "@ensforge/core/legacy/hca/admin";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface HcaAdminActions {
  readonly setHcaFactoryImplementationApproval: BoundAction<
    typeof setHcaFactoryImplementationApproval
  >;
  readonly setHcaUpgradeImplementationApproval: BoundAction<
    typeof setHcaUpgradeImplementationApproval
  >;
  readonly setTrustedHcaImplementation: BoundAction<typeof setTrustedHcaImplementation>;
  readonly transferHcaGovernanceOwnership: BoundAction<typeof transferHcaGovernanceOwnership>;
  readonly renounceHcaGovernanceOwnership: BoundAction<typeof renounceHcaGovernanceOwnership>;
  readonly grantTrustedHcaRoles: BoundAction<typeof grantTrustedHcaRoles>;
  readonly revokeTrustedHcaRoles: BoundAction<typeof revokeTrustedHcaRoles>;
  readonly getHcaGovernanceOwner: BoundAction<typeof getHcaGovernanceOwner>;
  readonly getTrustedHcaRoles: BoundAction<typeof getTrustedHcaRoles>;
}

export const makeHcaAdminActions = (config: EnsforgeConfig): HcaAdminActions =>
  Object.freeze({
    setHcaFactoryImplementationApproval: bindAction(config, setHcaFactoryImplementationApproval),
    setHcaUpgradeImplementationApproval: bindAction(config, setHcaUpgradeImplementationApproval),
    setTrustedHcaImplementation: bindAction(config, setTrustedHcaImplementation),
    transferHcaGovernanceOwnership: bindAction(config, transferHcaGovernanceOwnership),
    renounceHcaGovernanceOwnership: bindAction(config, renounceHcaGovernanceOwnership),
    grantTrustedHcaRoles: bindAction(config, grantTrustedHcaRoles),
    revokeTrustedHcaRoles: bindAction(config, revokeTrustedHcaRoles),
    getHcaGovernanceOwner: bindAction(config, getHcaGovernanceOwner),
    getTrustedHcaRoles: bindAction(config, getTrustedHcaRoles),
  });
