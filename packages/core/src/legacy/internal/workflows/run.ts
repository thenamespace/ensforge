import { Effect, Predicate } from "effect";

import type { EnsActionEffect } from "../../action/action.js";
import { WorkflowError } from "../../errors/workflow-error.js";
import type { WorkflowParameters } from "../../workflows/types.js";
import type { WalletOverrides, WriteError } from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { acquireWorkflow } from "./acquire.js";
import { encodeWorkflowValue } from "./codec.js";
import { workflowFingerprint, type WorkflowOperation } from "./identity.js";
import { ActiveWorkflow, WorkflowStep } from "./session.js";

const completed = (progress: unknown): boolean => {
  if (!Predicate.isObject(progress)) return false;
  if (typeof progress.status === "string")
    return progress.status === "completed" || progress.status === "not-required";
  return Predicate.isObject(progress.write) && progress.write.status === "completed";
};

const comparable = (value: unknown) =>
  Predicate.isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "workflowId" && key !== "workflowRevision"),
      )
    : value;

export const withWorkflow = <Parameters extends WorkflowParameters, Success>(
  operation: WorkflowOperation,
  implementation: EnsActionEffect<Parameters, Success, WriteError>,
): EnsActionEffect<Parameters, Success, WriteError> =>
  Effect.fn(`ensforge.workflow.${operation}`)(function* (config, parameters) {
    if (
      parameters.workflowId !== undefined &&
      (typeof parameters.workflowId !== "string" || !parameters.workflowId.trim())
    )
      return yield* new WorkflowError({
        code: "INVALID_STATE",
        message: "Workflow ID must be nonempty",
      });
    const parent = yield* ActiveWorkflow;
    if (!config.storage && !parent) {
      if (parameters.workflowId)
        return yield* new WorkflowError({
          code: "NOT_FOUND",
          message: "Configure storage before loading a workflow by ID",
        });
      return yield* implementation(config, parameters);
    }

    const fingerprintContext = { chainId: config.chainId, deployments: config.deployments };
    if (parent) {
      const key = yield* Effect.try({
        try: () => workflowFingerprint(operation, parameters, fingerprintContext),
        catch: (cause) =>
          new WorkflowError({
            code: "INVALID_STATE",
            message: "Invalid workflow identity inputs",
            cause,
          }),
      });
      const saved = parent.record.children[key];
      if (completed(saved)) return saved as Success;

      const result = yield* implementation(config, {
        ...parameters,
        ...(saved ? { resume: saved } : {}),
      }).pipe(Effect.provideService(WorkflowStep, key));
      yield* Effect.tryPromise({
        try: () =>
          parent.update((record) => ({
            ...record,
            children: { ...record.children, [key]: result },
          })),
        catch: (cause) =>
          cause instanceof WorkflowError
            ? cause
            : new WorkflowError({
                code: "STORAGE_FAILED",
                message: "Unable to checkpoint nested workflow",
                cause,
              }),
      });
      return result;
    }

    const storage = config.storage;
    if (!storage)
      return yield* new WorkflowError({
        code: "NOT_FOUND",
        message: "Workflow storage is not configured",
      });

    const { account } = yield* provideConfig(
      config,
      resolveWalletContext(parameters as WalletOverrides),
    );
    const address = (typeof account === "string" ? account : account.address).toLowerCase();
    const fingerprint = yield* Effect.try({
      try: () =>
        workflowFingerprint(operation, parameters, { ...fingerprintContext, account: address }),
      catch: (cause) =>
        new WorkflowError({
          code: "INVALID_STATE",
          message: "Invalid workflow identity inputs",
          cause,
        }),
    });
    const explicit = "resume" in parameters ? parameters.resume : undefined;
    const resumeId =
      Predicate.isObject(explicit) && typeof explicit.workflowId === "string"
        ? explicit.workflowId
        : undefined;
    if (resumeId && parameters.workflowId && resumeId !== parameters.workflowId)
      return yield* new WorkflowError({
        code: "IDENTITY_MISMATCH",
        message: "Explicit resume and workflow ID refer to different operations",
      });

    const session = yield* Effect.tryPromise({
      try: () =>
        acquireWorkflow(storage, {
          ...((resumeId ?? parameters.workflowId) ? { id: resumeId ?? parameters.workflowId } : {}),
          fingerprint,
          operation,
          chainId: config.chainId,
          account: address,
        }),
      catch: (cause) =>
        cause instanceof WorkflowError
          ? cause
          : new WorkflowError({
              code: "STORAGE_FAILED",
              message: "Unable to load workflow",
              cause,
            }),
    });

    const run = Effect.gen(function* () {
      if (explicit !== undefined && session.record.progress !== null) {
        const saved = session.record.progress;
        if (
          (Predicate.isObject(explicit) &&
            explicit.workflowRevision !== undefined &&
            Predicate.isObject(saved) &&
            explicit.workflowRevision !== saved.workflowRevision) ||
          encodeWorkflowValue(comparable(explicit)) !== encodeWorkflowValue(comparable(saved))
        )
          return yield* new WorkflowError({
            code: "CONFLICT",
            message: "Explicit resume conflicts with saved progress; reload the workflow",
            workflowId: session.record.id,
          });
      }

      if (session.record.status === "completed") return session.record.progress as Success;
      if (
        Object.values(session.record.submissions).some(
          (submission) => submission.reference === null,
        )
      )
        return yield* new WorkflowError({
          code: "SUBMISSION_UNCERTAIN",
          message: "A submission may have been broadcast; reconcile it before continuing",
          workflowId: session.record.id,
        });

      const resume = explicit ?? session.record.progress;
      const result = yield* implementation(config, {
        ...parameters,
        ...(resume === null || resume === undefined ? {} : { resume }),
      });
      const progress = {
        ...result,
        workflowId: session.record.id,
        workflowRevision: session.record.revision + 1,
      };

      yield* Effect.tryPromise({
        try: () =>
          session.update((record) => ({
            ...record,
            progress,
            status: completed(result) ? "completed" : "pending",
          })),
        catch: (cause) =>
          cause instanceof WorkflowError
            ? cause
            : new WorkflowError({
                code: "STORAGE_FAILED",
                message: "Unable to save workflow progress",
                workflowId: session.record.id,
                cause,
              }),
      });
      return progress as Success;
    });

    return yield* run.pipe(
      Effect.provideService(ActiveWorkflow, session),
      Effect.ensuring(Effect.promise(() => session.release())),
    );
  });
