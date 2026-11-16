import {
  estimateCalls,
  executeWritePlan,
  getCallsStatus,
  getWalletCapabilities,
  prepareCalls,
  readBatch,
  readBatchSettled,
  resumeCalls,
  sendCalls,
  simulateCalls,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import {
  bindAction,
  type BoundAction,
  type BoundReadBatch,
  type BoundReadBatchSettled,
} from "../internal/bind-action.js";

export interface BatchActions {
  readonly estimateCalls: BoundAction<typeof estimateCalls>;
  readonly executeWritePlan: BoundAction<typeof executeWritePlan>;
  readonly getCallsStatus: BoundAction<typeof getCallsStatus>;
  readonly getWalletCapabilities: BoundAction<typeof getWalletCapabilities>;
  readonly prepareCalls: BoundAction<typeof prepareCalls>;
  readonly readBatch: BoundReadBatch;
  readonly readBatchSettled: BoundReadBatchSettled;
  readonly resumeCalls: BoundAction<typeof resumeCalls>;
  readonly sendCalls: BoundAction<typeof sendCalls>;
  readonly simulateCalls: BoundAction<typeof simulateCalls>;
}

export const makeBatchActions = (config: EnsforgeConfig): BatchActions =>
  Object.freeze({
    estimateCalls: bindAction(config, estimateCalls),
    executeWritePlan: bindAction(config, executeWritePlan),
    getCallsStatus: bindAction(config, getCallsStatus),
    getWalletCapabilities: bindAction(config, getWalletCapabilities),
    prepareCalls: bindAction(config, prepareCalls),
    readBatch: bindAction(config, readBatch),
    readBatchSettled: bindAction(config, readBatchSettled),
    resumeCalls: bindAction(config, resumeCalls),
    sendCalls: bindAction(config, sendCalls),
    simulateCalls: bindAction(config, simulateCalls),
  });
