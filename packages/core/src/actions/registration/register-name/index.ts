import { Effect } from "effect";

import { erc20AllowanceAbi } from "@ensforge/contracts/internal";
import { keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { RegistrationError } from "../../../errors/registration-error.js";
import { WorkflowError } from "../../../errors/workflow-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError, WritePlan, WritePlanProgress } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { getSetRecordIntents } from "../../records/set-records/index.js";
import { getRegistrationPlan } from "../get-registration-plan/index.js";
import { makeRegistrationCommitment } from "../make-registration-commitment/index.js";
import { approvePaymentToken, commitName, completeRegistration } from "../mutation.js";
import type {
  AvailableRegistrationPrice,
  RegisterNameParameters,
  RegisterNameResult,
  RegistrationPlan,
} from "../types.js";

const confirmed = { type: "confirmed" } as const;

const requireActionablePlan = (
  plan: RegistrationPlan,
): Effect.Effect<
  Extract<
    RegistrationPlan,
    { status: "commitment-required" | "commitment-pending" | "ready" | "commitment-expired" }
  >,
  RegistrationError
> => {
  switch (plan.status) {
    case "unavailable":
      return new RegistrationError({
        code: "NAME_UNAVAILABLE",
        message: `${plan.name} is not available for registration`,
      });
    case "payment-token-required":
      return new RegistrationError({
        code: "PAYMENT_TOKEN_REQUIRED",
        message: `A payment token is required to register ${plan.name}`,
      });
    case "unsupported-payment-token":
      return new RegistrationError({
        code: "PAYMENT_TOKEN_UNSUPPORTED",
        message: `The selected payment token is not supported for ${plan.name}`,
      });
    default:
      return Effect.succeed(plan);
  }
};

const readAllowance = Effect.fn("ensforge.registerName.readAllowance")(function* (
  config: EnsforgeConfig,
  paymentToken: `0x${string}`,
  parameters: RegisterNameParameters,
) {
  if (config.deployments.protocol !== "v2") {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_UNSUPPORTED",
      message: "Payment-token allowance is only used by ENSv2 registration",
    });
  }

  const deployment = config.deployments.v2;
  const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const owner = typeof account === "string" ? account : account.address;

  return yield* Effect.tryPromise({
    try: () =>
      config.publicClient.readContract({
        address: paymentToken,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [owner, deployment.contracts.ethRegistrar],
      }),
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });
});

const hashPlan = (value: unknown) =>
  keccak256(
    stringToHex(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ),
  );

const commitmentParameters = (parameters: RegisterNameParameters) => ({
  name: parameters.name,
  duration: parameters.duration,
  owner: parameters.owner,
  secret: parameters.secret,
  records: [] as const,
  ...(parameters.resolver === undefined ? {} : { resolver: parameters.resolver }),
  ...(parameters.subregistry === undefined ? {} : { subregistry: parameters.subregistry }),
  ...(parameters.reverseRecord === undefined ? {} : { reverseRecord: parameters.reverseRecord }),
  ...(parameters.referrer === undefined ? {} : { referrer: parameters.referrer }),
  ...(parameters.paymentToken === undefined ? {} : { paymentToken: parameters.paymentToken }),
});

const registrationPlanId = (
  name: string,
  commitment: `0x${string}`,
  parameters: RegisterNameParameters,
) =>
  `registerName:${hashPlan({
    name,
    owner: parameters.owner,
    duration: parameters.duration,
    commitment,
    paymentToken: parameters.paymentToken ?? null,
    resolver: parameters.resolver ?? null,
    records: parameters.records ?? [],
  })}`;

const redactFailure = (failure: WriteError | null, name: string): WriteError | null =>
  failure === null || failure instanceof RegistrationError || failure instanceof WorkflowError
    ? failure
    : new RegistrationError({
        code: "REGISTRATION_FAILED",
        message: `Unable to complete registration for ${name}`,
      });

const registerNameEffect = Effect.fn("ensforge.registerName")(function* (
  config: EnsforgeConfig,
  parameters: RegisterNameParameters,
): Effect.fn.Return<RegisterNameResult, WriteError> {
  const completedRegistration = parameters.resume?.write.completedStages.some(
    (stage) => stage.id === "register",
  );

  if (parameters.resume !== undefined && completedRegistration) {
    const name = yield* normalizeName.effect(parameters.name);

    if (name !== parameters.resume.name) {
      return yield* new RegistrationError({
        code: "REGISTRATION_FAILED",
        message: "Registration resume data belongs to a different name",
      });
    }

    const commitment = yield* makeRegistrationCommitment
      .effect(config, commitmentParameters(parameters))
      .pipe(
        Effect.mapError((error) =>
          error instanceof WorkflowError
            ? error
            : new RegistrationError({
                code: "REGISTRATION_FAILED",
                message: "Unable to validate registration resume data",
              }),
        ),
      );

    if (commitment.commitment !== parameters.resume.commitment) {
      return yield* new RegistrationError({
        code: "REGISTRATION_FAILED",
        message: "Registration resume data does not match the supplied commitment",
      });
    }

    if (parameters.maxPrice !== undefined && parameters.resume.price.total > parameters.maxPrice) {
      return yield* new RegistrationError({
        code: "PRICE_EXCEEDS_MAXIMUM",
        message: `The registration price for ${name} exceeds maxPrice`,
      });
    }

    const stages: Array<WritePlan["stages"][number]> = [];

    if (parameters.resume.committedByWorkflow) {
      stages.push({
        type: "calls",
        id: "commit",
        calls: [commitName.call({ commitment: commitment.commitment })],
        mode: parameters.mode ?? "auto",
        atomicity: "none",
        confirmation: confirmed,
      });
    }

    if (parameters.resume.paymentApprovalIncluded && parameters.paymentToken !== undefined) {
      stages.push({
        type: "calls",
        id: "approve-payment",
        calls: [
          approvePaymentToken.call({
            paymentToken: parameters.paymentToken,
            amount: parameters.maxPrice ?? parameters.resume.price.total,
          }),
        ],
        mode: "sequential",
        atomicity: "none",
        confirmation: confirmed,
      });
    }

    stages.push({
      type: "calls",
      id: "register",
      calls: [
        completeRegistration.call({
          ...commitmentParameters(parameters),
          ...(parameters.maxPrice === undefined ? {} : { maxPrice: parameters.maxPrice }),
        }),
      ],
      mode: "sequential",
      atomicity: "none",
      confirmation: confirmed,
    });

    if ((parameters.records?.length ?? 0) > 0) {
      stages.push({
        type: "calls",
        id: "set-records",
        calls: getSetRecordIntents(name, parameters.records ?? []),
        mode: parameters.mode ?? "auto",
        atomicity: "preferred",
        confirmation: parameters.confirmation ?? confirmed,
      });
    }

    const write = yield* executeWritePlan
      .effect(config, {
        plan: {
          id: registrationPlanId(name, commitment.commitment, parameters),
          stages,
        },
        resume: parameters.resume.write,
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
      })
      .pipe(
        Effect.mapError((error) =>
          error instanceof WorkflowError
            ? error
            : new RegistrationError({
                code: "REGISTRATION_FAILED",
                message: `Unable to resume registration for ${name}`,
              }),
        ),
      );

    const safeWrite: WritePlanProgress = {
      ...write,
      failure: redactFailure(write.failure, name),
    };

    return {
      ...parameters.resume,
      status: safeWrite.status,
      write: safeWrite,
      nextActionAt: safeWrite.nextActionAt,
      finalState:
        safeWrite.status === "completed"
          ? yield* getNameState.effect(config, { name })
          : parameters.resume.finalState,
    };
  }

  let registrationPlan = yield* getRegistrationPlan
    .effect(config, commitmentParameters(parameters))
    .pipe(
      Effect.flatMap(requireActionablePlan),
      Effect.mapError((error) =>
        error instanceof RegistrationError
          ? error
          : new RegistrationError({
              code: "REGISTRATION_FAILED",
              message: "Unable to prepare name registration",
            }),
      ),
    );

  if (registrationPlan.status === "commitment-expired") {
    return yield* new RegistrationError({
      code: "COMMITMENT_EXPIRED",
      message: `The commitment for ${registrationPlan.name} has expired; create a new secret and restart`,
    });
  }

  if (
    parameters.resume !== undefined &&
    parameters.resume.commitment !== registrationPlan.commitment.commitment
  ) {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: "Registration resume data does not match the supplied commitment",
    });
  }

  if (
    parameters.maxPrice !== undefined &&
    registrationPlan.price.status === "available" &&
    registrationPlan.price.total > parameters.maxPrice
  ) {
    return yield* new RegistrationError({
      code: "PRICE_EXCEEDS_MAXIMUM",
      message: `The current registration price for ${registrationPlan.name} exceeds maxPrice`,
    });
  }

  const commitment = registrationPlan.commitment.commitment;

  const committedByWorkflow =
    parameters.resume?.committedByWorkflow ?? registrationPlan.status === "commitment-required";

  const planId = registrationPlanId(registrationPlan.name, commitment, parameters);
  let resume = parameters.resume?.write;

  if (registrationPlan.status === "commitment-required") {
    if (parameters.resume !== undefined) {
      return yield* new RegistrationError({
        code: "COMMITMENT_NOT_FOUND",
        message: `The commitment for ${registrationPlan.name} is no longer available`,
      });
    }

    resume = yield* executeWritePlan
      .effect(config, {
        plan: {
          id: planId,
          stages: [
            {
              type: "calls",
              id: "commit",
              calls: [commitName.call({ commitment })],
              mode: parameters.mode ?? "auto",
              atomicity: "none",
              confirmation: confirmed,
            },
          ],
        },
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
      })
      .pipe(
        Effect.mapError((error) =>
          error instanceof WorkflowError
            ? error
            : new RegistrationError({
                code: "REGISTRATION_FAILED",
                message: `Unable to submit the commitment for ${registrationPlan.name}`,
              }),
        ),
      );

    registrationPlan = yield* getRegistrationPlan
      .effect(config, commitmentParameters(parameters))
      .pipe(
        Effect.flatMap(requireActionablePlan),
        Effect.mapError((error) =>
          error instanceof WorkflowError
            ? error
            : new RegistrationError({
                code: "REGISTRATION_FAILED",
                message: `Unable to verify the commitment for ${registrationPlan.name}`,
              }),
        ),
      );
  }

  if (registrationPlan.status === "commitment-required") {
    return yield* new RegistrationError({
      code: "COMMITMENT_NOT_FOUND",
      message: `The commitment for ${registrationPlan.name} was not found after submission`,
    });
  }

  if (registrationPlan.status === "commitment-expired") {
    return yield* new RegistrationError({
      code: "COMMITMENT_EXPIRED",
      message: `The commitment for ${registrationPlan.name} has expired; create a new secret and restart`,
    });
  }

  if (registrationPlan.price.status !== "available") {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: `A registration price is unavailable for ${registrationPlan.name}`,
    });
  }

  let paymentApprovalIncluded = parameters.resume?.paymentApprovalIncluded ?? false;

  if (config.deployments.protocol === "v2") {
    const paymentToken = parameters.paymentToken;

    if (paymentToken === undefined) {
      return yield* new RegistrationError({
        code: "PAYMENT_TOKEN_REQUIRED",
        message: `A payment token is required to register ${registrationPlan.name}`,
      });
    }

    if (!paymentApprovalIncluded) {
      const allowance = yield* readAllowance(config, paymentToken, parameters);

      paymentApprovalIncluded = allowance < registrationPlan.price.total;
    }
  }

  const stages: Array<WritePlan["stages"][number]> = [];

  if (committedByWorkflow) {
    stages.push({
      type: "calls",
      id: "commit",
      calls: [commitName.call({ commitment })],
      mode: parameters.mode ?? "auto",
      atomicity: "none",
      confirmation: confirmed,
    });
  }

  if (
    registrationPlan.status === "commitment-pending" &&
    registrationPlan.commitmentStatus.status === "pending"
  ) {
    stages.push({
      type: "wait",
      id: "commitment-age",
      condition: { type: "timestamp", target: registrationPlan.commitmentStatus.readyAt },
    });
  }

  if (paymentApprovalIncluded && parameters.paymentToken !== undefined) {
    stages.push({
      type: "calls",
      id: "approve-payment",
      calls: [
        approvePaymentToken.call({
          paymentToken: parameters.paymentToken,
          amount: parameters.maxPrice ?? registrationPlan.price.total,
        }),
      ],
      mode: "sequential",
      atomicity: "none",
      confirmation: confirmed,
    });
  }

  stages.push({
    type: "calls",
    id: "register",
    calls: [
      completeRegistration.call({
        ...commitmentParameters(parameters),
        ...(parameters.maxPrice === undefined ? {} : { maxPrice: parameters.maxPrice }),
      }),
    ],
    mode: "sequential",
    atomicity: "none",
    confirmation: confirmed,
  });

  if ((parameters.records?.length ?? 0) > 0) {
    stages.push({
      type: "calls",
      id: "set-records",
      calls: getSetRecordIntents(registrationPlan.name, parameters.records ?? []),
      mode: parameters.mode ?? "auto",
      atomicity: "preferred",
      confirmation: parameters.confirmation ?? confirmed,
    });
  }

  const write = yield* executeWritePlan
    .effect(config, {
      plan: { id: planId, stages },
      ...(resume === undefined ? {} : { resume }),
      ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
      ...(parameters.account === undefined ? {} : { account: parameters.account }),
    })
    .pipe(
      Effect.mapError((error) =>
        error instanceof RegistrationError
          ? error
          : new RegistrationError({
              code: "REGISTRATION_FAILED",
              message: `Unable to complete registration for ${registrationPlan.name}`,
            }),
      ),
    );

  const safeWrite: WritePlanProgress = {
    ...write,
    failure: redactFailure(write.failure, registrationPlan.name),
  };

  return {
    status: safeWrite.status,
    name: registrationPlan.name,
    protocol: registrationPlan.commitment.protocol,
    commitment,
    committedByWorkflow,
    paymentApprovalIncluded,
    readyAt:
      registrationPlan.commitmentStatus.status === "not-found"
        ? null
        : registrationPlan.commitmentStatus.readyAt,
    expiresAt:
      registrationPlan.commitmentStatus.status === "not-found"
        ? null
        : registrationPlan.commitmentStatus.expiresAt,
    nextActionAt: safeWrite.nextActionAt,
    price: registrationPlan.price satisfies AvailableRegistrationPrice,
    write: safeWrite,
    finalState:
      safeWrite.status === "completed"
        ? yield* getNameState.effect(config, { name: registrationPlan.name })
        : null,
  };
});

export const registerName = defineAction<RegisterNameParameters, RegisterNameResult, WriteError>(
  withWorkflow("registerName", registerNameEffect),
);

export type { RegisterNameParameters, RegisterNameResult } from "../types.js";
