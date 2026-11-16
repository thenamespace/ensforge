import {
  approvePaymentToken,
  approveRenewalPayment,
  commitName,
  completeRegistration,
  getCommitmentStatus,
  getRegistrationParameters,
  getRegistrationPlan,
  getRegistrationPrice,
  getRenewalPrice,
  isPaymentTokenSupported,
  makeRegistrationCommitment,
  registerName,
  registerNames,
  renewName,
  renewNames,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface RegistrationActions {
  readonly approvePaymentToken: BoundAction<typeof approvePaymentToken>;
  readonly approveRenewalPayment: BoundAction<typeof approveRenewalPayment>;
  readonly commitName: BoundAction<typeof commitName>;
  readonly completeRegistration: BoundAction<typeof completeRegistration>;
  readonly getCommitmentStatus: BoundAction<typeof getCommitmentStatus>;
  readonly getRegistrationParameters: BoundAction<typeof getRegistrationParameters>;
  readonly getRegistrationPlan: BoundAction<typeof getRegistrationPlan>;
  readonly getRegistrationPrice: BoundAction<typeof getRegistrationPrice>;
  readonly getRenewalPrice: BoundAction<typeof getRenewalPrice>;
  readonly isPaymentTokenSupported: BoundAction<typeof isPaymentTokenSupported>;
  readonly makeRegistrationCommitment: BoundAction<typeof makeRegistrationCommitment>;
  readonly registerName: BoundAction<typeof registerName>;
  readonly registerNames: BoundAction<typeof registerNames>;
  readonly renewName: BoundAction<typeof renewName>;
  readonly renewNames: BoundAction<typeof renewNames>;
}

export const makeRegistrationActions = (config: EnsforgeConfig): RegistrationActions =>
  Object.freeze({
    approvePaymentToken: bindAction(config, approvePaymentToken),
    approveRenewalPayment: bindAction(config, approveRenewalPayment),
    commitName: bindAction(config, commitName),
    completeRegistration: bindAction(config, completeRegistration),
    getCommitmentStatus: bindAction(config, getCommitmentStatus),
    getRegistrationParameters: bindAction(config, getRegistrationParameters),
    getRegistrationPlan: bindAction(config, getRegistrationPlan),
    getRegistrationPrice: bindAction(config, getRegistrationPrice),
    getRenewalPrice: bindAction(config, getRenewalPrice),
    isPaymentTokenSupported: bindAction(config, isPaymentTokenSupported),
    makeRegistrationCommitment: bindAction(config, makeRegistrationCommitment),
    registerName: bindAction(config, registerName),
    registerNames: bindAction(config, registerNames),
    renewName: bindAction(config, renewName),
    renewNames: bindAction(config, renewNames),
  });
