import {
  getHcaEntryPoint,
  getHcaDeposit,
  getHcaNonce,
  getHcaSigningDomain,
  verifyHcaSignature,
  getHcaValidators,
  getHcaExecutors,
  getHcaHook,
  getHcaFallbackHandler,
  getHcaRegistry,
  isHcaModuleInstalled,
  supportsHcaExecutionMode,
  addHcaDeposit,
  withdrawHcaDeposit,
  getHcaUpgradeEligibility,
  upgradeHca,
  isHcaImplementationTrusted,
  getHcaUpgradeImplementationApproval,
  startHcaRegistration,
  getHcaRegistration,
  resumeHcaRegistration,
  cancelHcaRegistration,
  predictHcaAddress,
  getHca,
  getHcaOwner,
  getHcaImplementation,
  getHcaAccountId,
  getHcaSessionNonce,
  getAuthorizedHcaOwner,
  getHcaImplementationApproval,
  verifyHca,
  getHcaCapabilities,
  deployHca,
  prepareHcaCalls,
  executeHcaCalls,
  getHcaExecutionStatus,
  waitForHcaExecution,
  watchHcaExecution,
  revokeHcaSessions,
  enableHcaSession,
  enableHcaSessionWithRefund,
  isHcaSessionEnabled,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import {
  bindAction,
  type BoundExecuteHcaCalls,
  type BoundWatchHcaExecution,
  type BoundAction,
} from "../internal/bind-action.js";
import { makeHcaAdminActions, type HcaAdminActions } from "./hca-admin.js";

export interface HcaActions {
  readonly admin: HcaAdminActions;
  readonly getHcaEntryPoint: BoundAction<typeof getHcaEntryPoint>;
  readonly getHcaDeposit: BoundAction<typeof getHcaDeposit>;
  readonly getHcaNonce: BoundAction<typeof getHcaNonce>;
  readonly getHcaSigningDomain: BoundAction<typeof getHcaSigningDomain>;
  readonly verifyHcaSignature: BoundAction<typeof verifyHcaSignature>;
  readonly getHcaValidators: BoundAction<typeof getHcaValidators>;
  readonly getHcaExecutors: BoundAction<typeof getHcaExecutors>;
  readonly getHcaHook: BoundAction<typeof getHcaHook>;
  readonly getHcaFallbackHandler: BoundAction<typeof getHcaFallbackHandler>;
  readonly getHcaRegistry: BoundAction<typeof getHcaRegistry>;
  readonly isHcaModuleInstalled: BoundAction<typeof isHcaModuleInstalled>;
  readonly supportsHcaExecutionMode: BoundAction<typeof supportsHcaExecutionMode>;
  readonly addHcaDeposit: BoundAction<typeof addHcaDeposit>;
  readonly withdrawHcaDeposit: BoundAction<typeof withdrawHcaDeposit>;
  readonly getHcaUpgradeEligibility: BoundAction<typeof getHcaUpgradeEligibility>;
  readonly upgradeHca: BoundAction<typeof upgradeHca>;
  readonly isHcaImplementationTrusted: BoundAction<typeof isHcaImplementationTrusted>;
  readonly getHcaUpgradeImplementationApproval: BoundAction<
    typeof getHcaUpgradeImplementationApproval
  >;

  readonly startHcaRegistration: BoundAction<typeof startHcaRegistration>;
  readonly getHcaRegistration: BoundAction<typeof getHcaRegistration>;
  readonly resumeHcaRegistration: BoundAction<typeof resumeHcaRegistration>;
  readonly cancelHcaRegistration: BoundAction<typeof cancelHcaRegistration>;

  readonly predictHcaAddress: BoundAction<typeof predictHcaAddress>;
  readonly getHca: BoundAction<typeof getHca>;
  readonly getHcaOwner: BoundAction<typeof getHcaOwner>;
  readonly getHcaImplementation: BoundAction<typeof getHcaImplementation>;
  readonly getHcaAccountId: BoundAction<typeof getHcaAccountId>;
  readonly getHcaSessionNonce: BoundAction<typeof getHcaSessionNonce>;
  readonly getAuthorizedHcaOwner: BoundAction<typeof getAuthorizedHcaOwner>;
  readonly getHcaImplementationApproval: BoundAction<typeof getHcaImplementationApproval>;
  readonly verifyHca: BoundAction<typeof verifyHca>;
  readonly getHcaCapabilities: BoundAction<typeof getHcaCapabilities>;
  readonly deployHca: BoundAction<typeof deployHca>;
  readonly prepareHcaCalls: BoundAction<typeof prepareHcaCalls>;
  readonly executeHcaCalls: BoundExecuteHcaCalls;
  readonly getHcaExecutionStatus: BoundAction<typeof getHcaExecutionStatus>;
  readonly waitForHcaExecution: BoundAction<typeof waitForHcaExecution>;
  readonly watchHcaExecution: BoundWatchHcaExecution;
  readonly enableHcaSession: BoundAction<typeof enableHcaSession>;
  readonly enableHcaSessionWithRefund: BoundAction<typeof enableHcaSessionWithRefund>;
  readonly isHcaSessionEnabled: BoundAction<typeof isHcaSessionEnabled>;
  readonly revokeHcaSessions: BoundAction<typeof revokeHcaSessions>;
}

export const makeHcaActions = (config: EnsforgeConfig): HcaActions =>
  Object.freeze({
    admin: makeHcaAdminActions(config),
    getHcaEntryPoint: bindAction(config, getHcaEntryPoint),
    getHcaDeposit: bindAction(config, getHcaDeposit),
    getHcaNonce: bindAction(config, getHcaNonce),
    getHcaSigningDomain: bindAction(config, getHcaSigningDomain),
    verifyHcaSignature: bindAction(config, verifyHcaSignature),
    getHcaValidators: bindAction(config, getHcaValidators),
    getHcaExecutors: bindAction(config, getHcaExecutors),
    getHcaHook: bindAction(config, getHcaHook),
    getHcaFallbackHandler: bindAction(config, getHcaFallbackHandler),
    getHcaRegistry: bindAction(config, getHcaRegistry),
    isHcaModuleInstalled: bindAction(config, isHcaModuleInstalled),
    supportsHcaExecutionMode: bindAction(config, supportsHcaExecutionMode),
    addHcaDeposit: bindAction(config, addHcaDeposit),
    withdrawHcaDeposit: bindAction(config, withdrawHcaDeposit),
    getHcaUpgradeEligibility: bindAction(config, getHcaUpgradeEligibility),
    upgradeHca: bindAction(config, upgradeHca),
    isHcaImplementationTrusted: bindAction(config, isHcaImplementationTrusted),
    getHcaUpgradeImplementationApproval: bindAction(config, getHcaUpgradeImplementationApproval),

    startHcaRegistration: bindAction(config, startHcaRegistration),
    getHcaRegistration: bindAction(config, getHcaRegistration),
    resumeHcaRegistration: bindAction(config, resumeHcaRegistration),
    cancelHcaRegistration: bindAction(config, cancelHcaRegistration),

    predictHcaAddress: bindAction(config, predictHcaAddress),
    getHca: bindAction(config, getHca),
    getHcaOwner: bindAction(config, getHcaOwner),
    getHcaImplementation: bindAction(config, getHcaImplementation),
    getHcaAccountId: bindAction(config, getHcaAccountId),
    getHcaSessionNonce: bindAction(config, getHcaSessionNonce),
    getAuthorizedHcaOwner: bindAction(config, getAuthorizedHcaOwner),
    getHcaImplementationApproval: bindAction(config, getHcaImplementationApproval),
    verifyHca: bindAction(config, verifyHca),
    getHcaCapabilities: bindAction(config, getHcaCapabilities),
    deployHca: bindAction(config, deployHca),
    prepareHcaCalls: bindAction(config, prepareHcaCalls),
    executeHcaCalls: bindAction(config, executeHcaCalls),
    getHcaExecutionStatus: bindAction(config, getHcaExecutionStatus),
    waitForHcaExecution: bindAction(config, waitForHcaExecution),
    watchHcaExecution: bindAction(config, watchHcaExecution),
    revokeHcaSessions: bindAction(config, revokeHcaSessions),
    enableHcaSession: bindAction(config, enableHcaSession),
    enableHcaSessionWithRefund: bindAction(config, enableHcaSessionWithRefund),
    isHcaSessionEnabled: bindAction(config, isHcaSessionEnabled),
  });
