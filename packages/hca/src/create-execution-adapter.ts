import { Effect, Schema } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import {
  prepareHcaCalls,
  HcaExecutionOutcome,
  HcaExecutionPolicy,
  HcaExecutionCapabilities,
  HcaExecutionHash,
  type PreparedHcaCalls,
  type HcaExecutionStatus,
} from "@ensforge/core/legacy/hca";

import { createSubmissionPersistence } from "./persistence.js";
import type {
  ExecutionAdapterDefinition,
  ExecutionExtensions,
  TypedExecutionAdapter,
  PreparedExecution,
  AuthorizedExecution,
  ExecutionSubmission,
} from "./types.js";
import { checkAccount, checkContext, checkReview, decode, freezeEnvelope } from "./validation.js";

export const createExecutionAdapter = <
  P,
  A,
  S,
  Extensions extends ExecutionExtensions = Record<never, never>,
>(
  input: ExecutionAdapterDefinition<P, A, S, Extensions>,
): TypedExecutionAdapter<P, A, S, Extensions> => {
  const definition = Object.freeze({
    ...input,
    ...(input.policy === undefined
      ? {}
      : { policy: freezeEnvelope(Schema.decodeUnknownSync(HcaExecutionPolicy)(input.policy)) }),
    schemas: { ...input.schemas },
    submission: { ...input.submission },
  });

  Schema.decodeUnknownSync(Schema.Int.check(Schema.isGreaterThan(0)))(definition.chainId);
  Schema.decodeUnknownSync(Schema.NonEmptyString)(definition.profileId);

  const id = Schema.decodeUnknownSync(Schema.NonEmptyString)(definition.id);
  const fingerprint = Schema.decodeUnknownSync(HcaExecutionHash)(
    definition.configurationFingerprint,
  );

  Schema.decodeUnknownSync(Schema.Int.check(Schema.isGreaterThan(0)))(
    definition.submission.version,
  );

  const capabilities = Object.freeze(
    Schema.decodeUnknownSync(HcaExecutionCapabilities)(definition.capabilities),
  );

  const persistence = createSubmissionPersistence(
    id,
    fingerprint,
    definition.submission,
    definition,
  );

  // Prepared and authorized envelopes are local capabilities, never restored signed operations.
  const preparedEnvelopes = new WeakMap<object, PreparedHcaCalls>();
  const authorizedEnvelopes = new WeakMap<object, PreparedHcaCalls>();
  const attemptedSubmissions = new WeakSet<object>();

  const supports = (plan: PreparedHcaCalls) => {
    if (
      plan.account.chainId !== definition.chainId ||
      plan.account.profileId !== definition.profileId
    )
      return { supported: false, reason: "Adapter is configured for another chain or HCA profile" };

    if (plan.account.deployed === false && !capabilities.counterfactualDeployment)
      return { supported: false, reason: "Adapter cannot deploy an HCA" };

    if (
      !capabilities.atomicBatching ||
      (plan.authorization.kind === "owner"
        ? !capabilities.ownerExecution
        : !capabilities.sessionExecution)
    )
      return {
        supported: false,
        reason: "This route requires atomic execution and support for the requested authorization",
      };

    if (plan.requiredCapabilities?.some((key) => capabilities[key] !== true))
      return { supported: false, reason: "A required execution capability is unavailable" };

    return definition.supports(plan);
  };

  const prepare = defineAction<PreparedHcaCalls, PreparedExecution<P>, HcaError>(
    Effect.fn("hca.adapter.prepare")(function* (config, plan) {
      const support = yield* Effect.try({
        try: () => supports(plan),
        catch: (cause) =>
          new HcaError({ code: "ADAPTER_FAILED", message: "Compatibility check failed", cause }),
      });

      if (!support.supported)
        return yield* new HcaError({
          code: "UNSUPPORTED_CAPABILITY",
          message: support.reason ?? "Unsupported execution",
        });

      const identity = {
        ...(plan.operationId === undefined ? {} : { operationId: plan.operationId }),
        adapterId: id,
        instanceId: fingerprint,
        schemaVersion: 1 as const,
        configurationFingerprint: fingerprint,
        chainId: plan.account.chainId,
        hca: plan.account.address,
        profileId: plan.account.profileId,
        planFingerprint: plan.fingerprint,
      };

      yield* checkContext(config, identity);

      const freshPlan = yield* prepareHcaCalls
        .effect(config, {
          hca: plan.account.address,
          ...(plan.account.deployed === false ? { counterfactualOwner: plan.account.owner } : {}),
          salt: plan.account.salt,
          authorization: plan.authorization,
          calls: plan.calls,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new HcaError({
                code: "INVALID_EXECUTION",
                message: "Cannot validate HCA execution plan",
                cause,
              }),
          ),
        );

      if (
        freshPlan.fingerprint !== plan.fingerprint ||
        freshPlan.data !== plan.data ||
        freshPlan.value !== plan.value
      )
        return yield* new HcaError({
          code: "ADAPTER_MISMATCH",
          message: "HCA plan fingerprint does not match its calls",
        });

      yield* checkAccount(config, plan);

      const immutablePlan = freezeEnvelope({
        ...freshPlan,
        ...(plan.operationId === undefined ? {} : { operationId: plan.operationId }),
        ...(plan.requiredCapabilities === undefined
          ? {}
          : { requiredCapabilities: [...plan.requiredCapabilities] }),
      });

      const result = yield* definition.prepare.effect(config, immutablePlan);
      const payload = yield* decode(definition.schemas.prepared, result.payload);

      yield* checkReview(result.review, identity);

      if (
        result.review.authorizations.some(
          (authorization) =>
            authorization.signer.toLowerCase() !==
            (immutablePlan.session?.sessionKey ?? immutablePlan.account.owner).toLowerCase(),
        )
      )
        return yield* new HcaError({
          code: "OWNER_MISMATCH",
          message: "Execution must be authorized by the verified owner or session signer",
        });

      const policy = definition.policy;

      if (policy?.requireExpiry && result.review.expiresAt === undefined)
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "Execution policy requires an expiry",
        });

      if (policy?.feeLimits !== undefined) {
        for (const fee of result.review.fees) {
          const matches = (entry: Pick<typeof fee, "kind" | "chainId" | "token">) =>
            entry.kind === fee.kind &&
            entry.chainId === fee.chainId &&
            entry.token.toLowerCase() === fee.token.toLowerCase();

          const limit = policy.feeLimits.find(matches);

          // Aggregate matching fees so splitting an estimate cannot bypass its limit.
          const maximum = result.review.fees
            .filter(matches)
            .reduce((sum, entry) => sum + entry.maximum, 0n);

          if (!limit || maximum > limit.maximum)
            return yield* new HcaError({
              code: "INVALID_EXECUTION",
              message: "Execution exceeds the configured fee limits",
            });
        }
      }

      const prepared = freezeEnvelope({
        ...identity,
        payload,
        review: result.review,
        simulation: "succeeded" as const,
      });

      preparedEnvelopes.set(prepared, immutablePlan);

      return prepared;
    }),
  );

  const authorize = defineAction<PreparedExecution<P>, AuthorizedExecution<A>, HcaError>(
    Effect.fn("hca.adapter.authorize")(function* (config, prepared) {
      const plan = preparedEnvelopes.get(prepared);

      if (!plan)
        return yield* new HcaError({
          code: "ADAPTER_MISMATCH",
          message: "Prepare this operation with this adapter instance before signing",
        });

      yield* checkContext(config, prepared);
      yield* checkAccount(config, plan);
      yield* checkReview(prepared.review, prepared);

      const result = yield* definition.authorize.effect(config, prepared);
      const payload = yield* decode(definition.schemas.authorized, result);
      const { simulation: _simulation, ...identity } = prepared;
      const authorized = freezeEnvelope({ ...identity, payload });
      authorizedEnvelopes.set(authorized, plan);

      return authorized;
    }),
  );

  const submit = defineAction<AuthorizedExecution<A>, ExecutionSubmission<S>, HcaError>(
    Effect.fn("hca.adapter.submit")(function* (config, authorized) {
      const plan = authorizedEnvelopes.get(authorized);

      if (!plan || attemptedSubmissions.has(authorized))
        return yield* new HcaError({
          code: "ADAPTER_MISMATCH",
          message: "Invalid or already submitted authorization; reconcile before retrying",
        });

      yield* checkContext(config, authorized);
      yield* checkAccount(config, plan);
      yield* checkReview(authorized.review, authorized);

      // Claim after asynchronous revalidation so concurrent callers cannot both broadcast.
      if (attemptedSubmissions.has(authorized))
        return yield* new HcaError({
          code: "ADAPTER_MISMATCH",
          message: "This authorization is already being submitted; reconcile it before retrying",
        });

      attemptedSubmissions.add(authorized);

      const result = yield* definition.submit.effect(config, authorized).pipe(
        Effect.mapError(
          (cause) =>
            new HcaError({
              code: "SUBMISSION_UNCERTAIN",
              message: "Submission was attempted; reconcile with the provider before retrying",
              cause,
            }),
        ),
      );

      // Failure here can happen after broadcast. Do not report a safe-to-retry validation error.
      return yield* Effect.try({
        try: () => {
          const { review: _review, ...identity } = authorized;

          return freezeEnvelope(
            persistence.validate({
              ...identity,
              reference: result.reference,
              locator: result.locator,
              payload: result.payload,
              kind: "adapter",
            }),
          );
        },
        catch: (cause) =>
          new HcaError({
            code: "SUBMISSION_UNCERTAIN",
            message:
              "Provider returned invalid tracking data after submission; reconcile before retrying",
            cause,
          }),
      });
    }),
  );

  const getStatus = defineAction<ExecutionSubmission<S>, HcaExecutionStatus<S>, HcaError>(
    Effect.fn("hca.adapter.getStatus")(function* (config, tracking) {
      const submission = yield* Effect.try({
        try: () => persistence.validate(tracking),
        catch: (cause) =>
          new HcaError({ code: "INVALID_SUBMISSION", message: "Invalid tracking envelope", cause }),
      });

      yield* checkContext(config, submission);

      const outcome = yield* definition.getStatus.effect(config, submission);

      if (
        !Schema.is(HcaExecutionOutcome)(outcome) ||
        (outcome.status === "succeeded" &&
          (outcome.receipts.length === 0 ||
            outcome.receipts.some((receipt) => receipt.status !== "success")))
      )
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "Provider status needs a valid destination outcome",
        });

      return { ...outcome, submission };
    }),
  );

  return Object.freeze({
    id,
    instanceId: fingerprint,
    configurationFingerprint: fingerprint,
    capabilities,
    extensions: Object.freeze(definition.extensions ?? {}) as Extensions,
    supports,
    prepare,
    authorize,
    submit,
    getStatus,
    serializeSubmission: persistence.serializeSubmission,
    restoreSubmission: persistence.restoreSubmission,
  });
};
