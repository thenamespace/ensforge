import { Clock, Effect, Schema } from "effect";

import { HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import {
  verifyHca,
  prepareHcaCalls,
  HcaExecutionReview,
  HcaExecutionIdentitySchema,
  type PreparedHcaCalls,
  type HcaExecutionIdentity,
} from "@ensforge/core/legacy/hca";

export const decode = <T>(schema: Schema.Codec<T, unknown>, value: unknown) =>
  Schema.decodeUnknownEffect(Schema.toType(schema), { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(
      (cause) =>
        new HcaError({ code: "INVALID_EXECUTION", message: "Invalid execution envelope", cause }),
    ),
  );

export const checkReview = Effect.fn("hca.checkReview")(function* (
  review: HcaExecutionReview,
  identity: HcaExecutionIdentity,
) {
  yield* decode(HcaExecutionReview, review);

  const now = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));

  if (review.expiresAt !== undefined && review.expiresAt <= now)
    return yield* new HcaError({
      code: "EXECUTION_EXPIRED",
      message: "Execution quote expired; prepare again before signing or submitting",
    });

  if (
    review.simulation.chainId !== identity.chainId ||
    review.simulation.hca.toLowerCase() !== identity.hca.toLowerCase()
  )
    return yield* new HcaError({
      code: "ADAPTER_MISMATCH",
      message: "Simulation evidence belongs to another chain or account",
    });

  if (review.authorizations.length === 0 || review.fees.some((fee) => fee.expected > fee.maximum))
    return yield* new HcaError({
      code: "INVALID_EXECUTION",
      message: "Execution needs an authorization summary and valid fee bounds",
    });
});

export const checkContext = Effect.fn("hca.checkContext")(function* (
  config: EnsforgeConfig,
  identity: HcaExecutionIdentity,
) {
  // Additional version/provider fields are validated by their own envelope schemas.
  if (!Schema.is(HcaExecutionIdentitySchema)(identity) || identity.chainId !== config.chainId)
    return yield* new HcaError({
      code: "ADAPTER_MISMATCH",
      message: "Execution context does not match this SDK network",
    });

  const chainId = yield* Effect.tryPromise({
    try: () => config.publicClient.getChainId(),
    catch: (cause) =>
      new HcaError({ code: "ADAPTER_FAILED", message: "Cannot verify RPC chain", cause }),
  });

  if (chainId !== config.chainId)
    return yield* new HcaError({ code: "ADAPTER_MISMATCH", message: "RPC network changed" });
});

/** Provider envelopes are data only. Clone through their codecs before freezing. */
export const freezeEnvelope = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeEnvelope(child);

    Object.freeze(value);
  }

  return value;
};

export const checkAccount = Effect.fn("hca.checkAccount")(function* (
  config: EnsforgeConfig,
  plan: PreparedHcaCalls,
) {
  const current = yield* verifyHca
    .effect(config, {
      hca: plan.account.address,
      expectedOwner: plan.account.owner,
      allowUndeployed: plan.account.deployed === false,
      salt: plan.account.salt,
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new HcaError({
            code: "ACCOUNT_MISMATCH",
            message: "HCA account must be reverified before execution",
            cause,
          }),
      ),
    );

  if (plan.authorization.kind === "session") {
    const fresh = yield* prepareHcaCalls
      .effect(config, {
        hca: plan.account.address,
        salt: plan.account.salt,
        authorization: plan.authorization,
        calls: plan.calls,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new HcaError({
              code: "INVALID_EXECUTION",
              message: "Session authorization must remain valid with its original policy",
              cause,
            }),
        ),
      );

    if (fresh.fingerprint !== plan.fingerprint)
      return yield* new HcaError({
        code: "ADAPTER_MISMATCH",
        message: "Session plan changed; prepare again",
      });
  }

  if (
    current.profileId !== plan.account.profileId ||
    current.currentImplementation.toLowerCase() !==
      plan.account.currentImplementation.toLowerCase() ||
    current.sessionNonce !== plan.account.sessionNonce
  )
    return yield* new HcaError({
      code: "ACCOUNT_MISMATCH",
      message: "HCA implementation or session nonce changed; prepare again",
    });
});
