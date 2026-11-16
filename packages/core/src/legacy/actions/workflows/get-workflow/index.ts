import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import { inspectWorkflow } from "../../../internal/workflows/inspect.js";
import type { WorkflowSnapshot } from "../../../workflows/types.js";
import type { WalletOverrides, WriteError } from "../../../write/types.js";

export const getWorkflow = defineAction<
  WalletOverrides & { readonly workflowId: string },
  WorkflowSnapshot,
  WriteError
>(
  Effect.fn("ensforge.getWorkflow")(function* (config, parameters) {
    const { record } = yield* inspectWorkflow(config, parameters);
    return {
      workflowId: record.id,
      revision: record.revision,
      operation: record.operation,
      chainId: record.chainId,
      account: record.account,
      status: record.status,
      busyUntil: record.owner ? record.leaseUntil : null,
      progress: record.progress,
      submissions: Object.entries(record.submissions).map(([id, submission]) => ({
        id,
        kind: submission.kind,
        reference: submission.reference,
      })),
    };
  }),
);
