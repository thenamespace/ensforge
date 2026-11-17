import { Effect } from "effect";

import { keccak256, stringToHex } from "viem";

import { WalletError } from "../../errors/wallet-error.js";
import { WorkflowError } from "../../errors/workflow-error.js";
import type { PreparedWriteCall } from "../../write/types.js";
import { encodeWorkflowValue } from "./codec.js";
import { ActiveWorkflow, WorkflowStep } from "./session.js";

export const journalKey = (
  kind: "transaction" | "batch",
  calls: ReadonlyArray<PreparedWriteCall>,
  step = "root",
) => {
  const values = calls.map((call) => ({
    to: call.to.toLowerCase(),
    data: (call.data ?? "0x").toLowerCase(),
    value: call.value,
    from: (typeof call.account === "string" ? call.account : call.account.address).toLowerCase(),
  }));
  return {
    key: keccak256(stringToHex(encodeWorkflowValue({ kind, step, calls: values }))),
    values,
  };
};

export const journalSubmission = <Success, Failure>(
  kind: "transaction" | "batch",
  calls: ReadonlyArray<PreparedWriteCall>,
  submit: () => Effect.Effect<Success, Failure>,
  reference: (result: Success) => string,
  restore: (reference: string) => Success,
): Effect.Effect<Success, Failure | WorkflowError> =>
  Effect.gen(function* () {
    const session = yield* ActiveWorkflow;
    if (!session) return yield* submit();

    const step = yield* WorkflowStep;
    if (
      Object.values(session.record.submissions).some(
        (submission) => submission.step === step && submission.kind !== kind,
      )
    )
      return yield* new WorkflowError({
        code: "CONFLICT",
        message: "A submitted step cannot switch between transaction and wallet batch execution",
        workflowId: session.record.id,
      });
    const { key, values } = journalKey(kind, calls, step);
    const slot = encodeWorkflowValue({
      step,
      kind,
      calls: calls.map(({ id, operation }) => ({ id, operation })),
    });
    const previous = Object.entries(session.record.submissions).find(
      ([, submission]) => submission.slot === slot,
    );
    if (previous && previous[0] !== key)
      return yield* new WorkflowError({
        code: "CONFLICT",
        message:
          "A previously submitted step now produces different calls; reconcile before continuing",
        workflowId: session.record.id,
      });
    const saved = session.record.submissions[key];
    if (saved?.reference) return restore(saved.reference);
    if (saved)
      return yield* new WorkflowError({
        code: "SUBMISSION_UNCERTAIN",
        message: "Submission outcome is unknown; reconciliation is required",
        workflowId: session.record.id,
      });

    yield* Effect.tryPromise({
      try: () =>
        session.update((record) => ({
          ...record,
          leaseUntil: Date.now() + 120_000,
          submissions: {
            ...record.submissions,
            [key]: { kind, slot, step, calls: values, reference: null },
          },
        })),
      catch: (cause) =>
        cause instanceof WorkflowError
          ? cause
          : new WorkflowError({
              code: "STORAGE_FAILED",
              message: "Cannot persist submission intent",
              cause,
            }),
    });

    const result = yield* submit().pipe(
      Effect.tapError((error) => {
        if (!(error instanceof WalletError) || error.code !== "USER_REJECTED") return Effect.void;
        return Effect.tryPromise({
          try: () =>
            session.update((record) => ({
              ...record,
              submissions: Object.fromEntries(
                Object.entries(record.submissions).filter(([id]) => id !== key),
              ),
            })),
          catch: (cause) =>
            new WorkflowError({
              code: "STORAGE_FAILED",
              message: "Unable to clear a rejected wallet request",
              cause,
            }),
        });
      }),
    );
    yield* Effect.tryPromise({
      try: () =>
        session.update((record) => ({
          ...record,
          submissions: {
            ...record.submissions,
            [key]: { kind, slot, step, calls: values, reference: reference(result) },
          },
        })),
      catch: (cause) =>
        new WorkflowError({
          code: "SUBMISSION_UNCERTAIN",
          message: "Submission returned but its reference could not be saved",
          workflowId: session.record.id,
          cause,
        }),
    });
    return result;
  });
