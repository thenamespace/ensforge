import { Effect } from "effect";

import {
  erc20AllowanceAbi,
  erc20ApproveAbi,
  ethRegistrarControllerV1CommitAbi,
  ethRegistrarControllerV1RegisterAbi,
  ethRegistrarV2CommitAbi,
  ethRegistrarV2RegisterAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData, zeroAddress, zeroHash } from "viem";

import type { EnsWriteIntentPreparer } from "../../action/write-intent.js";
import { ContractError } from "../../errors/contract-error.js";
import { RegistrationError } from "../../errors/registration-error.js";
import { viemErrorToEffectError } from "../../internal/errors/viem-error.js";
import { getSecondLevelEthLabel } from "../../internal/registration/second-level-eth.js";
import { makeSingleWriteAction } from "../../internal/write/single-write-action.js";
import type { WriteError } from "../../write/types.js";
import { decodeOwnershipAddress } from "../ownership/address.js";
import { getRegistrationPlan } from "./get-registration-plan/index.js";
import { isPaymentTokenSupported } from "./is-payment-token-supported/index.js";
import type {
  ApprovePaymentTokenParameters,
  CommitNameParameters,
  CompleteRegistrationParameters,
} from "./types.js";

const encode = (operation: string, makeData: () => `0x${string}`) =>
  Effect.try({
    try: makeData,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation}`,
        cause,
      }),
  });

const commitPreparer: EnsWriteIntentPreparer<CommitNameParameters, WriteError> = Effect.fn(
  "ensforge.commitName.prepare",
)(function* (config, parameters) {
  const profile = config.deployments;

  return {
    to:
      profile.protocol === "v1"
        ? profile.v1.contracts.ethRegistrarController
        : profile.v2.contracts.ethRegistrar,
    data: yield* encode("commitName", () =>
      encodeFunctionData({
        abi:
          profile.protocol === "v1" ? ethRegistrarControllerV1CommitAbi : ethRegistrarV2CommitAbi,
        functionName: "commit",
        args: [parameters.commitment],
      }),
    ),
    value: 0n,
    protocol: profile.protocol,
  };
});

const approvePaymentTokenPreparer: EnsWriteIntentPreparer<
  ApprovePaymentTokenParameters,
  WriteError
> = Effect.fn("ensforge.approvePaymentToken.prepare")(function* (config, parameters) {
  const profile = config.deployments;

  if (profile.protocol === "v1") {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_UNSUPPORTED",
      message: "ENSv1 registration uses native ETH and does not accept payment tokens",
    });
  }

  if (parameters.amount < 0n) {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: "Payment-token approval amount cannot be negative",
    });
  }

  const paymentToken = yield* decodeOwnershipAddress(parameters.paymentToken, "payment token");
  const support = yield* isPaymentTokenSupported.effect(config, { paymentToken });

  if (!support.supported) {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_UNSUPPORTED",
      message: "The selected ENSv2 registration payment token is not supported",
    });
  }

  return {
    to: paymentToken,
    data: yield* encode("approvePaymentToken", () =>
      encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [profile.v2.contracts.ethRegistrar, parameters.amount],
      }),
    ),
    value: 0n,
    protocol: "v2" as const,
  };
});

const completeRegistrationPreparer: EnsWriteIntentPreparer<
  CompleteRegistrationParameters,
  WriteError
> = Effect.fn("ensforge.completeRegistration.prepare")(function* (config, parameters, context) {
  const profile = config.deployments;
  const plan = yield* getRegistrationPlan.effect(config, parameters);

  if (plan.status === "unavailable") {
    return yield* new RegistrationError({
      code: "NAME_UNAVAILABLE",
      message: `${plan.name} is not available for registration`,
    });
  }

  if (plan.status === "payment-token-required") {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_REQUIRED",
      message: `A payment token is required to register ${plan.name}`,
    });
  }

  if (plan.status === "unsupported-payment-token") {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_UNSUPPORTED",
      message: `The selected payment token is not supported for ${plan.name}`,
    });
  }

  if (plan.status === "commitment-required") {
    return yield* new RegistrationError({
      code: "COMMITMENT_NOT_FOUND",
      message: `No active commitment exists for ${plan.name}`,
    });
  }

  if (plan.status === "commitment-pending") {
    return yield* new RegistrationError({
      code: "COMMITMENT_PENDING",
      message: `The commitment for ${plan.name} is not old enough`,
    });
  }

  if (plan.status === "commitment-expired") {
    return yield* new RegistrationError({
      code: "COMMITMENT_EXPIRED",
      message: `The commitment for ${plan.name} has expired`,
    });
  }

  if (plan.price.status !== "available") {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: `A registration price is unavailable for ${plan.name}`,
    });
  }

  if (parameters.maxPrice !== undefined && plan.price.total > parameters.maxPrice) {
    return yield* new RegistrationError({
      code: "PRICE_EXCEEDS_MAXIMUM",
      message: `The current registration price for ${plan.name} exceeds maxPrice`,
    });
  }

  const label = yield* getSecondLevelEthLabel(plan.name);

  if (profile.protocol === "v1") {
    return {
      to: profile.v1.contracts.ethRegistrarController,
      data: yield* encode("completeRegistration", () =>
        encodeFunctionData({
          abi: ethRegistrarControllerV1RegisterAbi,
          functionName: "register",
          args: [
            {
              label,
              owner: parameters.owner,
              duration: parameters.duration,
              secret: parameters.secret,
              resolver: parameters.resolver ?? profile.v1.contracts.publicResolver,
              data: parameters.records ?? [],
              reverseRecord: parameters.reverseRecord ?? 0,
              referrer: parameters.referrer ?? zeroHash,
            },
          ],
        }),
      ),
      value: plan.price.total,
      protocol: "v1" as const,
    };
  }

  const paymentToken = parameters.paymentToken;

  if (paymentToken === undefined || plan.price.currency.kind !== "erc20") {
    return yield* new RegistrationError({
      code: "PAYMENT_TOKEN_REQUIRED",
      message: `A payment token is required to register ${plan.name}`,
    });
  }

  const account = typeof context.account === "string" ? context.account : context.account.address;

  const allowance = yield* Effect.tryPromise({
    try: () =>
      config.publicClient.readContract({
        address: paymentToken,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [account, profile.v2.contracts.ethRegistrar],
      }),
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });

  if (allowance < plan.price.total) {
    return yield* new RegistrationError({
      code: "INSUFFICIENT_ALLOWANCE",
      message: `Payment-token allowance is insufficient to register ${plan.name}`,
    });
  }

  return {
    to: profile.v2.contracts.ethRegistrar,
    data: yield* encode("completeRegistration", () =>
      encodeFunctionData({
        abi: ethRegistrarV2RegisterAbi,
        functionName: "register",
        args: [
          label,
          parameters.owner,
          parameters.secret,
          parameters.subregistry ?? zeroAddress,
          parameters.resolver ?? profile.v2.contracts.publicResolver,
          parameters.duration,
          paymentToken,
          parameters.referrer ?? zeroHash,
        ],
      }),
    ),
    value: 0n,
    protocol: "v2" as const,
  };
});

export const commitName = makeSingleWriteAction("commitName", commitPreparer);

export const approvePaymentToken = makeSingleWriteAction(
  "approvePaymentToken",
  approvePaymentTokenPreparer,
);

export const completeRegistration = makeSingleWriteAction(
  "completeRegistration",
  completeRegistrationPreparer,
  { sensitive: true },
);
