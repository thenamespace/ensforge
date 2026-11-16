import { Effect, Result } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { WorkflowError } from "../../errors/workflow-error.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import { provideConfig } from "../../internal/config/context.js";
import { viemErrorToEffectError } from "../../internal/errors/viem-error.js";
import { PublicClientService } from "../../internal/services/public-client.js";
import { ActiveWorkflow, WorkflowStep } from "../../internal/workflows/session.js";
import { executeSequential } from "../../internal/write/execute-sequential.js";
import { resumeSequentialConfirmations } from "../../internal/write/resume-sequential.js";
import type {
  CallExecutionResult,
  ExecuteWritePlanParameters,
  WriteError,
  WritePlanProgress,
  WriteStage,
  WriteStageResult,
  WriteWaitCondition,
} from "../../write/types.js";
import { resumeCalls } from "./resume-calls.js";
import { sendCalls } from "./send-calls.js";

const waitIsComplete = Effect.fn("waitIsComplete")(function* (condition: WriteWaitCondition) {
  const { client } = yield* PublicClientService;

  const block = yield* Effect.tryPromise({
    try: () => client.getBlock({ blockTag: "latest" }),
    catch: (cause) => viemErrorToEffectError(cause, "getBlock"),
  });

  return condition.type === "block"
    ? block.number !== null && block.number >= condition.target
    : block.timestamp >= condition.target;
});

const validatePlan = (parameters: ExecuteWritePlanParameters): WritePlanError | undefined => {
  if (parameters.plan.stages.length === 0) {
    return new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "A write plan must contain at least one stage",
      cause: parameters.plan,
    });
  }

  const ids = new Set(parameters.plan.stages.map((stage) => stage.id));

  if (ids.size !== parameters.plan.stages.length) {
    return new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "Write plan stage identifiers must be unique",
      cause: parameters.plan,
    });
  }

  if (parameters.resume !== undefined && parameters.resume.planId !== parameters.plan.id) {
    return new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "Write progress belongs to a different plan",
      cause: parameters.resume,
    });
  }

  const callStageIds = parameters.plan.stages
    .filter((stage) => stage.type === "calls")
    .map((stage) => stage.id);

  for (const [index, completed] of (parameters.resume?.completedStages ?? []).entries()) {
    if (callStageIds[index] !== completed.id) {
      return new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "Write progress is not a valid prefix of the supplied plan",
        cause: parameters.resume,
      });
    }
  }

  return undefined;
};

const stageParameters = (
  stage: Extract<WriteStage, { readonly type: "calls" }>,
  parameters: ExecuteWritePlanParameters,
) => ({
  calls: stage.calls,
  mode: stage.mode ?? "auto",
  atomicity: stage.atomicity ?? "preferred",
  ...(stage.confirmation === undefined ? {} : { confirmation: stage.confirmation }),
  ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
  ...(parameters.account === undefined ? {} : { account: parameters.account }),
});

const executeWritePlanEffect = Effect.fn("ensforge.executeWritePlan")(function* (
  config: EnsforgeConfig,
  input: ExecuteWritePlanParameters,
): Effect.fn.Return<WritePlanProgress, WriteError> {
  const workflow = yield* ActiveWorkflow;
  const workflowStep = yield* WorkflowStep;
  const checkpointKey = `${workflowStep}/${input.plan.id}`;
  const saved = workflow?.record.plans[checkpointKey] as WritePlanProgress | undefined;
  const parameters = saved && input.resume === undefined ? { ...input, resume: saved } : input;

  const invalid = validatePlan(parameters);

  if (invalid !== undefined) return yield* invalid;

  yield* Effect.annotateCurrentSpan({
    "ens.network": config.network,
    "ens.write.operation": "execute-plan",
    "ens.write.stage_count": parameters.plan.stages.length,
    "ens.write.resumed": parameters.resume !== undefined,
  });

  const completed = [...(parameters.resume?.completedStages ?? [])];

  const completedIds = new Set(
    completed
      .filter(
        (stage) =>
          (stage.result.mode !== "sequential" || stage.result.status !== "partial") &&
          (stage.result.mode !== "batch" || stage.result.status !== "submitted"),
      )
      .map((stage) => stage.id),
  );

  for (const stage of parameters.plan.stages) {
    if (stage.type === "wait") {
      const ready = yield* provideConfig(config, waitIsComplete(stage.condition));

      if (!ready) {
        return {
          planId: parameters.plan.id,
          status: "waiting",
          completedStages: completed,
          currentStage: stage.id,
          nextActionAt: stage.condition.target,
          failure: null,
        };
      }

      continue;
    }

    if (completedIds.has(stage.id)) continue;

    const previousIndex = completed.findIndex((result) => result.id === stage.id);
    const previous = previousIndex === -1 ? undefined : completed[previousIndex];

    const partial =
      previous?.result.mode === "sequential" && previous.result.status === "partial"
        ? previous.result
        : undefined;

    const submittedBatch =
      previous?.result.mode === "batch" && previous.result.status === "submitted"
        ? previous.result
        : undefined;

    const resumedPartial =
      partial === undefined
        ? undefined
        : yield* resumeSequentialConfirmations(
            config,
            partial,
            stage.confirmation ?? config.writes.confirmation,
          );

    if (resumedPartial?.failure !== null && resumedPartial?.failure !== undefined) {
      const resumedStage = { id: stage.id, result: resumedPartial } satisfies WriteStageResult;

      if (previousIndex === -1) completed.push(resumedStage);
      else completed[previousIndex] = resumedStage;

      return {
        planId: parameters.plan.id,
        status: "partial",
        completedStages: completed,
        currentStage: stage.id,
        nextActionAt: null,
        failure: resumedPartial.failure,
      };
    }

    const confirmed = resumedPartial?.calls.filter((call) => call.status === "confirmed") ?? [];
    const remainingCalls = stage.calls.slice(confirmed.length);

    const execution = yield* Effect.result(
      (submittedBatch !== undefined
        ? resumeCalls.effect(config, {
            batch: submittedBatch,
            confirmation: stage.confirmation ?? config.writes.confirmation,
            ...(parameters.walletClient === undefined
              ? {}
              : { walletClient: parameters.walletClient }),
            ...(parameters.account === undefined ? {} : { account: parameters.account }),
          })
        : resumedPartial === undefined
          ? sendCalls.effect(config, stageParameters(stage, parameters))
          : executeSequential(
              config,
              { ...stageParameters(stage, parameters), calls: remainingCalls, mode: "sequential" },
              confirmed.length,
            ).pipe(
              Effect.map((resumed) => ({
                mode: "sequential" as const,
                atomic: false as const,
                status: resumed.status,
                calls: [...confirmed, ...resumed.calls] as ReadonlyArray<CallExecutionResult>,
                failure: resumed.failure,
              })),
            )
      ).pipe(
        Effect.provideService(WorkflowStep, `${workflowStep}/${parameters.plan.id}/${stage.id}`),
      ),
    );

    if (Result.isFailure(execution)) {
      if (completed.length === 0) return yield* execution.failure;

      return {
        planId: parameters.plan.id,
        status: "partial",
        completedStages: completed,
        currentStage: stage.id,
        nextActionAt: null,
        failure: execution.failure,
      };
    }

    const result = execution.success;
    const stageResult = { id: stage.id, result } satisfies WriteStageResult;

    if (previousIndex === -1) completed.push(stageResult);
    else completed[previousIndex] = stageResult;

    if (workflow) {
      const checkpoint: WritePlanProgress = {
        planId: parameters.plan.id,
        status: "partial",
        completedStages: [...completed],
        currentStage: stage.id,
        nextActionAt: null,
        failure: null,
      };
      yield* Effect.tryPromise({
        try: () =>
          workflow.update((record) => ({
            ...record,
            plans: { ...record.plans, [checkpointKey]: checkpoint },
          })),
        catch: (cause) =>
          cause instanceof WorkflowError
            ? cause
            : new WorkflowError({
                code: "STORAGE_FAILED",
                message: "Unable to checkpoint write stage",
                workflowId: workflow.record.id,
                cause,
              }),
      });
    }

    if (result.mode === "sequential" && result.status === "partial") {
      return {
        planId: parameters.plan.id,
        status: "partial",
        completedStages: completed,
        currentStage: stage.id,
        nextActionAt: null,
        failure: result.failure,
      };
    }

    if (result.mode === "batch" && result.status === "submitted") {
      return {
        planId: parameters.plan.id,
        status: "submitted",
        completedStages: completed,
        currentStage: stage.id,
        nextActionAt: null,
        failure: null,
      };
    }
  }

  return {
    planId: parameters.plan.id,
    status: "completed",
    completedStages: completed,
    currentStage: null,
    nextActionAt: null,
    failure: null,
  };
});

export const executeWritePlan = defineAction<
  ExecuteWritePlanParameters,
  WritePlanProgress,
  WriteError
>(executeWritePlanEffect);
