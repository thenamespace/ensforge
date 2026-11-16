import { HcaError } from "@ensforge/core/legacy";
import {
  getPermit2Address,
  type PreparedTransactionData,
  type RhinestoneAccount,
} from "@rhinestone/sdk";
import { hashTypedData, maxUint256, zeroHash } from "viem";

import type { QuoteRhinestoneFundingParameters, RhinestoneFundingRoute } from "./types.js";

/** Validate the signed mandate, not just the provider's fee summary. */
export const reviewFunding = (
  account: RhinestoneAccount,
  prepared: PreparedTransactionData,
  route: RhinestoneFundingRoute,
  input: QuoteRhinestoneFundingParameters,
  maximumLifetime: number,
) => {
  const op = prepared.intentRoute.intentOp;
  const element = op.elements[0];
  const now = BigInt(Math.floor(Date.now() / 1000));

  if (op.elements.length !== 1 || !element)
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Funding requires exactly one source-chain element",
    });

  const mandate = element.mandate;
  const context = mandate.qualifier.settlementContext;
  const permission = element.idsAndAmounts[0];
  const output = mandate.tokenOut[0];
  const sourceSpend = BigInt(permission?.[1] ?? 0);
  const expiresAt = BigInt(op.expires);
  const fillDeadline = BigInt(mandate.fillDeadline);
  const nonce = BigInt(op.nonce);
  // Permit2 uses the low 160 bits; the provider retains the Compact resource prefix.
  const tokenMask = (1n << 160n) - 1n;

  if (
    Number(element.chainId) !== route.sourceChainId ||
    Number(mandate.destinationChainId) !== route.destinationChainId ||
    op.sponsor.toLowerCase() !== input.source.account.address.toLowerCase() ||
    mandate.recipient.toLowerCase() !== input.destinationHca.toLowerCase() ||
    element.arbiter.toLowerCase() !== route.arbiter.toLowerCase() ||
    context.settlementLayer !== route.settlementLayer ||
    context.fundingMethod !== "PERMIT2" ||
    context.using7579 ||
    mandate.qualifier.encodedVal.toLowerCase() !== route.qualifier.toLowerCase() ||
    context.gasRefund ||
    mandate.destinationOps.vt !== zeroHash ||
    mandate.preClaimOps.vt !== zeroHash ||
    mandate.destinationOps.ops.length ||
    mandate.preClaimOps.ops.length ||
    Object.keys(element.swapOrigins ?? {}).length ||
    (mandate.swapDestinations ?? []).some(Boolean)
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Provider returned an unapproved funding route, call or refund",
    });

  if (
    element.idsAndAmounts.length !== 1 ||
    !permission ||
    BigInt(permission[0]) < 0n ||
    BigInt(permission[0]) > maxUint256 ||
    (BigInt(permission[0]) & tokenMask) !== BigInt(route.sourceToken) ||
    sourceSpend <= 0n ||
    sourceSpend > input.maximumSourceSpend ||
    mandate.tokenOut.length !== 1 ||
    !output ||
    BigInt(output[0]) < 0n ||
    BigInt(output[0]) > maxUint256 ||
    (BigInt(output[0]) & tokenMask) !== BigInt(route.destinationToken) ||
    BigInt(output[1]) !== input.amount ||
    element.spendTokens.some(
      ([token, value]) =>
        BigInt(token) < 0n ||
        BigInt(token) > maxUint256 ||
        (BigInt(token) & tokenMask) !== BigInt(route.sourceToken) ||
        BigInt(value) < 0n ||
        BigInt(value) > sourceSpend,
    ) ||
    nonce < 0n ||
    nonce > maxUint256 ||
    expiresAt <= now ||
    fillDeadline <= now ||
    expiresAt > now + BigInt(maximumLifetime) ||
    fillDeadline > now + BigInt(maximumLifetime)
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Funding token amounts, nonce or deadlines exceed the requested bounds",
    });

  for (const [chain, requirements] of Object.entries(
    prepared.intentRoute.tokenRequirements ?? {},
  )) {
    for (const [token, requirement] of Object.entries(requirements)) {
      if (
        Number(chain) !== route.sourceChainId ||
        token.toLowerCase() !== route.sourceToken.toLowerCase() ||
        requirement.type !== "approval" ||
        requirement.spender.toLowerCase() !== getPermit2Address().toLowerCase() ||
        requirement.amount < 0n ||
        requirement.amount > sourceSpend
      )
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Unexpected wrapping or approval requirement",
        });
    }
  }

  const messages = account.getTransactionMessages(prepared);
  const message = messages.origin[0];

  if (
    messages.origin.length !== 1 ||
    !message ||
    message.domain?.name !== "Permit2" ||
    Number(message.domain.chainId) !== route.sourceChainId ||
    message.domain.verifyingContract?.toLowerCase() !== getPermit2Address().toLowerCase()
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Unexpected funding signature domain",
    });

  return {
    sourceSpend,
    expiresAt,
    fillDeadline,
    permitNonce: nonce,
    scopeHash: hashTypedData(message),
  };
};
