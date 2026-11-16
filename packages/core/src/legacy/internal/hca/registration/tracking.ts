import { getHcaExecutionStatus } from "../../../actions/hca/get-hca-execution-status/index.js";
import type {
  HcaRegistrationOperation,
  HcaRegistrationContext,
} from "../../../actions/hca/registration-types.js";
import type { HcaExecutionSubmission } from "../../../actions/hca/types.js";
import { getNameState } from "../../../actions/name/get-name-state/index.js";
import { getCommitmentStatus } from "../../../actions/registration/get-commitment-status/index.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { HcaError } from "../../../errors/hca-error.js";
import { saveOperation } from "./storage.js";

type Attempt = Extract<
  HcaRegistrationOperation["progress"],
  { status: "submitting" | "submitted" }
>["attempt"];

export const trackSubmission = (
  context: HcaRegistrationContext,
  operation: HcaRegistrationOperation,
  attempt: Attempt,
  submission: HcaExecutionSubmission,
): Attempt => {
  if (
    submission.operationId !== `${operation.id}:${attempt.step}` ||
    submission.chainId !== operation.chainId ||
    submission.hca.toLowerCase() !== operation.hca.toLowerCase() ||
    submission.profileId !== operation.profileId ||
    submission.planFingerprint !== attempt.planFingerprint
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Recovered submission belongs to another registration attempt",
    });

  if (submission.kind === "transaction") {
    if (
      operation.route.kind !== "owner" ||
      submission.owner.toLowerCase() !== operation.owner.toLowerCase()
    )
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "Recovered wallet submission has another owner or route",
      });

    return { ...attempt, tracking: { kind: "transaction", hash: submission.hash } };
  }

  if (
    !context.execution ||
    operation.route.kind !== "adapter" ||
    submission.adapterId !== operation.route.id ||
    submission.instanceId !== operation.route.instanceId
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Recovered provider submission has another route",
    });

  return {
    ...attempt,
    tracking: { kind: "adapter", serialized: context.execution.serializeSubmission(submission) },
  };
};

export const reconcileRegistration = async (
  config: EnsforgeConfig,
  context: HcaRegistrationContext,
  operation: HcaRegistrationOperation,
  signal: AbortSignal,
) => {
  const progress = operation.progress;

  if (progress.status === "submitted" || progress.status === "submitting") {
    const { attempt } = progress;
    const { tracking } = attempt;

    if (!tracking) return operation;

    const identity = {
      operationId: `${operation.id}:${attempt.step}`,
      chainId: operation.chainId,
      hca: operation.hca,
      profileId: operation.profileId,
      planFingerprint: attempt.planFingerprint,
    };
    let submission: HcaExecutionSubmission;

    if (tracking.kind === "transaction") {
      submission = {
        ...identity,
        kind: "transaction",
        owner: operation.owner,
        hash: tracking.hash,
      };
    } else {
      if (!context.execution)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Execution adapter is required for tracking",
        });

      submission = context.execution.restoreSubmission(tracking.serialized, identity);
      trackSubmission(context, operation, attempt, submission);
    }

    const status = await getHcaExecutionStatus(
      config,
      {
        submission,
        ...(context.execution ? { execution: context.execution } : {}),
      },
      { signal },
    );

    if (status.status === "unknown" || status.status === "pending") return operation;

    if (status.status !== "succeeded")
      return saveOperation(
        context,
        operation,
        {
          status: "failed",
          reason: `The ${progress.attempt.step} submission ${status.status}; no automatic resubmission`,
        },
        progress.attempt.step === "commit"
          ? { commitmentSubmission: progress.attempt }
          : { registrationSubmission: progress.attempt },
      );

    if (progress.attempt.step === "register") {
      const state = await getNameState(config, { name: operation.registration.name }, { signal });

      if (
        state.owner?.toLowerCase() !== operation.owner.toLowerCase() ||
        state.resolver?.toLowerCase() !== operation.registration.resolver.toLowerCase()
      )
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Confirmed registration does not match the expected owner and resolver",
        });

      const receipt = status.receipts.at(-1);

      if (!receipt)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Registration receipt is unavailable",
        });

      return saveOperation(
        context,
        operation,
        { status: "registered", transactionHash: receipt.transactionHash },
        { registrationSubmission: progress.attempt },
      );
    }

    const commitment = await getCommitmentStatus(
      config,
      { commitment: operation.registration.commitment },
      { signal },
    );

    if (commitment.status === "not-found")
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "Confirmed commitment is missing on-chain",
      });

    return saveOperation(
      context,
      operation,
      commitment.status === "expired"
        ? {
            status: "expired",
            reason: "Commitment expired; start a new operation with a fresh secret",
          }
        : { status: "waiting", readyAt: commitment.readyAt, expiresAt: commitment.expiresAt },
      { commitmentSubmission: progress.attempt },
    );
  }

  if (progress.status === "waiting") {
    const commitment = await getCommitmentStatus(
      config,
      { commitment: operation.registration.commitment },
      { signal },
    );

    if (commitment.status === "expired")
      return saveOperation(context, operation, {
        status: "expired",
        reason: "Commitment expired; start a new registration",
      });

    if (commitment.status === "not-found")
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "Saved commitment disappeared; reconcile chain history before continuing",
      });
  }

  return operation;
};
