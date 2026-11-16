import { Effect, Schema } from "effect";

import { isAddressEqual, type Hex } from "viem";

import { defineAction } from "../../../action/action.js";
import { WorkflowError } from "../../../errors/workflow-error.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { inspectWorkflow } from "../../../internal/workflows/inspect.js";
import { storeWorkflowRecord, workflowNamespace } from "../../../internal/workflows/record.js";
import { Hex as HexSchema } from "../../../schemas/hex.js";
import type { WalletOverrides, WriteError } from "../../../write/types.js";

/** Attach a lost transaction response only after matching the actual on-chain transaction. */
export const reconcileWorkflowSubmission = defineAction<
  WalletOverrides & {
    readonly workflowId: string;
    readonly submissionId: string;
    readonly transactionHash: Hex;
  },
  void,
  WriteError
>(
  Effect.fn("ensforge.reconcileWorkflowSubmission")(function* (config, parameters) {
    const { storage, record } = yield* inspectWorkflow(config, parameters);
    if (record.owner && record.leaseUntil > Date.now())
      return yield* new WorkflowError({
        code: "BUSY",
        message: "Workflow is still being advanced",
        workflowId: record.id,
      });
    if (
      !Schema.is(HexSchema.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/)))(
        parameters.transactionHash,
      )
    )
      return yield* new WorkflowError({
        code: "INVALID_STATE",
        message: "Expected a transaction hash",
      });

    const submission = record.submissions[parameters.submissionId];
    if (!submission || submission.kind !== "transaction" || submission.calls.length !== 1)
      return yield* new WorkflowError({
        code: "INVALID_STATE",
        message: "Select a single transaction submission to reconcile",
      });
    if (submission.reference && submission.reference !== parameters.transactionHash)
      return yield* new WorkflowError({
        code: "CONFLICT",
        message: "This submission already has a different tracking reference",
      });

    const transaction = yield* Effect.tryPromise({
      try: () => config.publicClient.getTransaction({ hash: parameters.transactionHash }),
      catch: (cause) => viemErrorToEffectError(cause, "readContract"),
    });
    const call = submission.calls[0];
    if (
      !call ||
      !transaction.to ||
      !isAddressEqual(transaction.to, call.to as Hex) ||
      !isAddressEqual(transaction.from, call.from as Hex) ||
      transaction.input.toLowerCase() !== call.data ||
      transaction.value !== call.value ||
      (transaction.chainId !== undefined && transaction.chainId !== config.chainId)
    )
      return yield* new WorkflowError({
        code: "IDENTITY_MISMATCH",
        message: "Transaction does not match the saved submission intent",
        workflowId: record.id,
      });

    const updated = {
      ...record,
      owner: null,
      leaseUntil: 0,
      revision: record.revision + 1,
      submissions: {
        ...record.submissions,
        [parameters.submissionId]: { ...submission, reference: parameters.transactionHash },
      },
    };
    const saved = yield* Effect.tryPromise({
      try: () =>
        storage.compareAndSwap({
          namespace: workflowNamespace,
          id: record.id,
          expectedRevision: record.revision,
          record: storeWorkflowRecord(updated),
        }),
      catch: (cause) =>
        new WorkflowError({
          code: "STORAGE_FAILED",
          message: "Unable to save reconciled submission",
          cause,
        }),
    });
    if (!saved)
      return yield* new WorkflowError({
        code: "CONFLICT",
        message: "Workflow changed while reconciling",
        workflowId: record.id,
      });
  }),
);
