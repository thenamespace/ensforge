import { Effect, Schema } from "effect";

import { erc20Abi } from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { registrationCalls } from "../../../internal/hca/registration/calls.js";
import {
  prepareRegistrationExecution,
  checkRegistrationFees,
} from "../../../internal/hca/registration/execution.js";
import { loadOperation, saveOperation } from "../../../internal/hca/registration/storage.js";
import {
  reconcileRegistration,
  trackSubmission,
} from "../../../internal/hca/registration/tracking.js";
import { getRegistrationPlan } from "../../registration/get-registration-plan/index.js";
import { makeRegistrationCommitment } from "../../registration/make-registration-commitment/index.js";
import { HcaExecutionHash } from "../execution-contract.js";
import { prepareHcaCalls } from "../prepare-hca-calls/index.js";
import {
  HcaRegistrationLimits,
  type HcaRegistrationOperation,
  type ResumeHcaRegistrationParameters,
} from "../registration-types.js";
import { verifyHca } from "../verify-hca/index.js";

export const resumeHcaRegistration = defineAction<
  ResumeHcaRegistrationParameters,
  HcaRegistrationOperation,
  HcaError
>((config, provided) => {
  const storage = provided.storage ?? config.storage;
  const parameters = { ...provided, ...(storage === undefined ? {} : { storage }) };
  return Effect.tryPromise({
    try: async (signal) => {
      let operation = await loadOperation(config, parameters, parameters.id);

      if (["registered", "cancelled", "failed", "expired"].includes(operation.progress.status))
        return operation;

      if (parameters.submission) {
        if (operation.progress.status !== "submitting" && operation.progress.status !== "submitted")
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "There is no submission attempt to reconcile",
          });

        if (operation.progress.attempt.tracking)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "A tracking reference is already saved",
          });

        const attempt = trackSubmission(
          parameters,
          operation,
          operation.progress.attempt,
          parameters.submission,
        );

        operation = await saveOperation(parameters, operation, { status: "submitted", attempt });
      }

      operation = await reconcileRegistration(config, parameters, operation, signal);

      if (
        ["submitting", "submitted", "registered", "failed", "expired"].includes(
          operation.progress.status,
        )
      )
        return operation;

      if (parameters.limits || parameters.authorization || parameters.signerReference) {
        operation = await saveOperation(parameters, operation, operation.progress, {
          ...(parameters.limits
            ? { limits: Schema.decodeUnknownSync(HcaRegistrationLimits)(parameters.limits) }
            : {}),
          ...(parameters.authorization ? { authorization: parameters.authorization } : {}),
          ...(parameters.signerReference ? { signerReference: parameters.signerReference } : {}),
        });
      }

      const account = await verifyHca(
        config,
        { hca: operation.hca, expectedOwner: operation.owner, salt: operation.salt },
        { signal },
      );

      if (account.profileId !== operation.profileId)
        throw new HcaError({ code: "INVALID_EXECUTION", message: "Registration profile changed" });

      const input = { ...operation.registration, owner: operation.owner };
      const commitment = await makeRegistrationCommitment(config, input, { signal });

      if (
        commitment.commitment !== operation.registration.commitment ||
        commitment.registrar.toLowerCase() !== operation.registration.registrar.toLowerCase() ||
        commitment.name !== operation.registration.name
      )
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Saved registration inputs or commitment secret do not match",
        });

      const registration = await getRegistrationPlan(config, input, { signal });

      if (registration.status === "unavailable")
        return saveOperation(parameters, operation, {
          status: "failed",
          reason: "Name is no longer available",
        });

      if (
        registration.status === "payment-token-required" ||
        registration.status === "unsupported-payment-token"
      )
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Registration payment token is not supported",
        });

      if (registration.status === "commitment-expired")
        return saveOperation(parameters, operation, {
          status: "expired",
          reason: "Commitment expired; start a new operation with a fresh secret",
        });

      if (registration.status === "commitment-pending") {
        const status = registration.commitmentStatus;

        if (status.status !== "pending")
          throw new HcaError({ code: "INVALID_EXECUTION", message: "Commitment status changed" });

        return saveOperation(parameters, operation, {
          status: "waiting",
          readyAt: status.readyAt,
          expiresAt: status.expiresAt,
        });
      }

      if (registration.price.status !== "available")
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Registration price is unavailable",
        });

      if (registration.price.total > operation.limits.registrationPrice)
        return saveOperation(parameters, operation, {
          status: "needs-review",
          reason: "Registration price exceeds the accepted limit",
        });

      const step =
        registration.status === "commitment-required" ? ("commit" as const) : ("register" as const);

      if (step === "commit" && operation.commitmentSubmission)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Confirmed commitment disappeared; no automatic resubmission",
        });

      if (step === "register") {
        const balance = await config.publicClient.readContract({
          address: operation.registration.paymentToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [operation.hca],
        });

        if (balance < registration.price.total)
          return saveOperation(parameters, operation, {
            status: "needs-funding",
            token: operation.registration.paymentToken,
            required: registration.price.total,
            balance,
          });
      }

      let plan;

      try {
        plan = await prepareHcaCalls(
          config,
          {
            hca: operation.hca,
            salt: operation.salt,
            operationId: `${operation.id}:${step}`,
            authorization: operation.authorization,
            calls: registrationCalls(config, operation, step, registration.price.total),
          },
          { signal },
        );
      } catch (cause) {
        if (
          operation.authorization.kind === "session" &&
          cause instanceof HcaError &&
          ["INVALID_EXECUTION", "UNSUPPORTED_AUTHORIZATION", "EXECUTION_EXPIRED"].includes(
            cause.code,
          )
        )
          return saveOperation(parameters, operation, {
            status: "needs-authorization",
            reason:
              "Session is unavailable or does not permit this registration batch; verify or re-enable it before resuming",
          });

        throw cause;
      }

      if (
        plan.session &&
        plan.session.resolver.toLowerCase() !== operation.registration.resolver.toLowerCase()
      )
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Session is bound to another resolver",
        });

      const execution = await prepareRegistrationExecution(
        config,
        parameters,
        operation,
        plan,
        signal,
      );

      const requirement = await checkRegistrationFees(
        config,
        parameters,
        operation,
        execution.review,
      );

      if (requirement) return saveOperation(parameters, operation, requirement);

      const submit = await execution.authorize();
      signal.throwIfAborted();
      const hashPayload = Schema.Struct({ userOperationHash: HcaExecutionHash });
      const attempt = {
        step,
        planFingerprint: plan.fingerprint,
        ...(Schema.is(hashPayload)(execution.payload)
          ? { userOperationHash: execution.payload.userOperationHash }
          : {}),
      };

      // This durable claim is never automatically released: a lost response may mean a successful broadcast.
      operation = await saveOperation(parameters, operation, { status: "submitting", attempt });
      const submission = await submit();
      const tracked = trackSubmission(parameters, operation, attempt, submission);
      operation = await saveOperation(parameters, operation, {
        status: "submitted",
        attempt: tracked,
      });

      return reconcileRegistration(config, parameters, operation, signal);
    },
    catch: (cause) =>
      cause instanceof HcaError
        ? cause
        : new HcaError({
            code: "INVALID_EXECUTION",
            message: "HCA registration could not progress; saved state is retained",
            cause,
          }),
  });
});
