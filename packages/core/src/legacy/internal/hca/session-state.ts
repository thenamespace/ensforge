import { Effect, Schema } from "effect";

import { isAddressEqual, recoverAddress } from "viem";

import {
  HcaSessionAuthorizationSchema,
  type HcaAuthorization,
  type VerifiedHcaAccount,
  type VerifiedHcaSession,
} from "../../actions/hca/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import { hcaRpc } from "./context.js";
import { hcaSessionAuthorizationData } from "./session-authorization.js";

/** Validate the owner proof again on every preparation, including expiry and revocation. */
export const readHcaSession = Effect.fn("readHcaSession")(function* (
  config: EnsforgeConfig,
  account: VerifiedHcaAccount,
  reference: Extract<HcaAuthorization, { kind: "session" }>,
) {
  const session = reference.session;

  if (!Schema.is(HcaSessionAuthorizationSchema)(session))
    return yield* new HcaError({
      code: "INVALID_PARAMETERS",
      message:
        "Expected a signed HCA session authorization; transaction-based sessions belong to the previous deployment",
    });

  const block = yield* hcaRpc(() => config.publicClient.getBlock());

  if (
    !isAddressEqual(session.hca, account.address) ||
    session.chainId !== account.chainId ||
    session.sessionNonce !== account.sessionNonce ||
    BigInt(session.validUntil) <= block.timestamp
  )
    return yield* new HcaError({
      code: "INVALID_EXECUTION",
      message: "Session belongs to a different account/network, has expired, or has been revoked",
    });

  const authorization = hcaSessionAuthorizationData(account.address, account.chainId, session);
  const signer = yield* hcaRpc(() =>
    recoverAddress({ hash: authorization.digest, signature: session.ownerSignature }),
  );

  if (!isAddressEqual(signer, account.owner) || authorization.permissionId !== session.permissionId)
    return yield* new HcaError({
      code: "INVALID_EXECUTION",
      message: "Session policy or owner signature is invalid",
    });

  return Object.freeze({
    ...session,
    ...(session.refund ? { refund: Object.freeze({ ...session.refund }) } : {}),
    salt: authorization.salt,
    sessionDigest: authorization.sessionDigest,
  }) satisfies VerifiedHcaSession;
});
