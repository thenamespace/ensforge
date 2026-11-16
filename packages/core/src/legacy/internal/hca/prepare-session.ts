import { Effect, Schema } from "effect";

import { isAddressEqual } from "viem";

import type { EnableHcaSessionWithRefundParameters } from "../../actions/hca/enable-hca-session-with-refund/types.js";
import type { EnableHcaSessionParameters } from "../../actions/hca/enable-hca-session/types.js";
import {
  HcaSessionAuthorizationSchema,
  type HcaSessionAuthorization,
} from "../../actions/hca/types.js";
import { verifyHca } from "../../actions/hca/verify-hca/index.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { hcaRpc, resolveHcaProfile } from "./context.js";
import { hcaSessionAuthorizationData } from "./session-authorization.js";

/** The current validator consumes a reusable owner proof; enablement sends no transaction. */
export const prepareHcaSession = Effect.fn("prepareHcaSession")(function* (
  config: EnsforgeConfig,
  parameters: EnableHcaSessionParameters | EnableHcaSessionWithRefundParameters,
) {
  const account = yield* verifyHca.effect(config, parameters);
  const wallet = yield* provideConfig(config, resolveWalletContext(parameters));
  const signer = typeof wallet.account === "string" ? wallet.account : wallet.account.address;

  if (!isAddressEqual(signer, account.owner))
    return yield* new HcaError({
      code: "OWNER_MISMATCH",
      message: "Only the HCA owner can authorize a session",
    });

  const profile = yield* resolveHcaProfile(config);

  const policy = {
    hca: account.address,
    chainId: account.chainId,
    sessionKey: parameters.sessionKey,
    resolver: parameters.resolver,
    validUntil: parameters.validUntil,
    sessionNonce: account.sessionNonce,
    // The deployed validator requires nonzero refund bounds even for sponsored sessions.
    // Minimal bounds preserve the sponsored flow; paid refunds need an explicit policy.
    refund:
      "refund" in parameters
        ? parameters.refund
        : {
            token: profile.infrastructure.paymentToken,
            maxExchangeRate: 1n,
            maxGasOverhead: 0n,
            maxAmount: 1n,
          },
  };
  const placeholder = `0x${"00".repeat(65)}` as const;
  const block = yield* hcaRpc(() => config.publicClient.getBlock());

  if (
    !Schema.is(HcaSessionAuthorizationSchema)({
      ...policy,
      ownerSignature: placeholder,
      permissionId: `0x${"00".repeat(32)}`,
    }) ||
    BigInt(policy.validUntil) <= block.timestamp
  )
    return yield* new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Expected a session key, resolver, future uint48 expiry and bounded refund limits",
    });

  const authorization = hcaSessionAuthorizationData(account.address, account.chainId, policy);

  if (
    parameters.permissionId !== undefined &&
    parameters.permissionId !== authorization.permissionId
  )
    return yield* new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Permission ID does not match the session policy",
    });

  const ownerSignature = yield* hcaRpc(() =>
    wallet.walletClient.signTypedData({ account: wallet.account, ...authorization.data }),
  );

  return {
    ...policy,
    permissionId: authorization.permissionId,
    ownerSignature,
  } satisfies HcaSessionAuthorization;
});
