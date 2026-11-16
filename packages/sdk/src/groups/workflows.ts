import {
  listWorkflows,
  getWorkflow,
  reconcileWorkflowSubmission,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface WorkflowActions {
  readonly listWorkflows: BoundAction<typeof listWorkflows>;
  readonly getWorkflow: BoundAction<typeof getWorkflow>;
  readonly reconcileWorkflowSubmission: BoundAction<typeof reconcileWorkflowSubmission>;
}

export const makeWorkflowActions = (config: EnsforgeConfig): WorkflowActions =>
  Object.freeze({
    getWorkflow: bindAction(config, getWorkflow),
    listWorkflows: bindAction(config, listWorkflows),
    reconcileWorkflowSubmission: bindAction(config, reconcileWorkflowSubmission),
  });
