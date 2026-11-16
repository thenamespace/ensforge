import { ethRegistrarV2Abi } from "@ensforge/contracts/v2";
import { HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import type { HcaExecutionFee, PreparedHcaCalls } from "@ensforge/core/legacy/hca";
import type { PreparedTransactionData } from "@rhinestone/sdk";
import { getTypedData } from "@rhinestone/sdk/dist/src/execution/singleChainOps";
import { decodeFunctionData, erc20Abi, hashTypedData, zeroAddress } from "viem";

import type { RhinestoneOptions } from "./types.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const reject = (message: string): never => {
  throw new HcaError({ code: "INVALID_EXECUTION", message });
};

/** A prefunded destination route must not introduce source funding, swaps or extra calls. */
export const reviewRoute = async (
  options: RhinestoneOptions,
  config: EnsforgeConfig,
  plan: PreparedHcaCalls,
  prepared: PreparedTransactionData,
) => {
  const route = prepared.intentRoute;
  const op = route.intentOp;
  const element = op.elements[0];

  if (op.elements.length !== 1 || !element || !plan.session)
    return reject("Expected one destination session operation");

  const mandate = element.mandate;
  const context = mandate.qualifier.settlementContext;
  const profile = options.profile;

  const expectedArbiter =
    profile.infrastructure.intentExecutorAdapter ?? profile.infrastructure.intentExecutor;

  if (!same(element.arbiter, expectedArbiter))
    throw new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "Rhinestone returned a route for a different intent executor adapter",
      cause: {
        expectedIntentExecutor: profile.infrastructure.intentExecutor,
        expectedArbiter,
        returnedArbiter: element.arbiter,
        chainId: config.chainId,
      },
    });

  if (
    Number(element.chainId) !== config.chainId ||
    Number(mandate.destinationChainId) !== config.chainId ||
    !same(mandate.recipient, plan.account.address) ||
    context.settlementLayer !== "INTENT_EXECUTOR" ||
    context.fundingMethod !== "NO_FUNDING" ||
    !context.using7579 ||
    Object.keys(element.swapOrigins ?? {}).length !== 0 ||
    (mandate.swapDestinations ?? []).some(Boolean) ||
    mandate.tokenOut.some(([, amount]) => BigInt(amount) !== 0n)
  )
    return reject(
      "Rhinestone only accepts prefunded same-chain operations without source calls, swaps or token movements",
    );

  if (
    mandate.preClaimOps.ops.length !== 0 ||
    Object.keys(route.tokenRequirements ?? {}).length !== 0 ||
    [...element.idsAndAmounts, ...element.spendTokens].some(([, amount]) => BigInt(amount) !== 0n)
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message:
        "Rhinestone quote requires source funding or approvals; this adapter only authorizes destination execution. A NO_FUNDING label alone does not make this quote compatible.",
      cause: {
        preClaimCalls: mandate.preClaimOps.ops.length,
        tokenRequirements: route.tokenRequirements,
        idsAndAmounts: element.idsAndAmounts,
        spendTokens: element.spendTokens,
      },
    });

  if (
    mandate.destinationOps.vt !== `0x0201${"00".repeat(30)}` ||
    mandate.destinationOps.ops.length !== plan.calls.length ||
    mandate.destinationOps.ops.some((call, index) => {
      const expected = plan.calls[index];

      if (!expected) return true;

      return (
        !same(call.to, expected.to) ||
        !same(call.data, expected.data) ||
        BigInt(call.value) !== expected.value
      );
    })
  )
    return reject("Provider changed the requested destination batch");

  const expiresAt = [
    BigInt(op.expires),
    BigInt(mandate.fillDeadline),
    BigInt(plan.session.validUntil),
  ].reduce((a, b) => (a < b ? a : b));

  const quotedRefund = context.gasRefund;
  const refund =
    quotedRefund &&
    !(
      same(quotedRefund.token, zeroAddress) &&
      BigInt(quotedRefund.exchangeRate) === 0n &&
      BigInt(quotedRefund.overhead) === 0n
    )
      ? quotedRefund
      : undefined;

  const maximum = refund ? BigInt(refund.overhead) >> 128n : 0n;
  const gasOverhead = refund ? BigInt(refund.overhead) & ((1n << 128n) - 1n) : 0n;
  const rate = refund ? BigInt(refund.exchangeRate) : 0n;
  const bound = plan.session.refund;

  if (
    refund &&
    (!bound ||
      !same(refund.token, bound.token) ||
      rate <= 0n ||
      rate > bound.maxExchangeRate ||
      maximum <= 0n ||
      maximum > bound.maxAmount ||
      gasOverhead > bound.maxGasOverhead ||
      BigInt(refund.overhead) >= 1n << 256n)
  )
    return reject("Provider refund exceeds the enabled session limits");

  if ((options.sponsored ?? true) && refund)
    return reject("A sponsored operation cannot charge the HCA a refund");

  if (!(options.sponsored ?? true) && !refund)
    return reject("Unsponsored execution requires an explicit bounded refund quote");

  for (const call of plan.calls) {
    if (call.data.slice(0, 10).toLowerCase() !== "0x095ea7b3") continue;

    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });

    if (
      decoded.functionName === "approve" &&
      same(decoded.args[0], profile.infrastructure.gasRefundPaymaster) &&
      (!refund || !same(call.to, refund.token) || decoded.args[1] !== maximum)
    )
      return reject("Paymaster approval must equal this operation's signed refund cap");
  }

  const fees: HcaExecutionFee[] = [
    {
      kind: "execution",
      chainId: config.chainId,
      token: refund?.token ?? "native",
      expected: maximum,
      maximum,
      sponsored: options.sponsored ?? true,
    },
  ];

  // Registrar prices are separate from executor refunds; allowance is the on-chain spend bound.
  const registrar = profile.deployment.contracts.ethRegistrar;
  const registrationCalls = plan.calls.flatMap((call) => {
    if (!same(call.to, registrar)) return [];

    const decoded = decodeFunctionData({ abi: ethRegistrarV2Abi, data: call.data });

    if (decoded.functionName !== "register") return [];

    const [label, , , , , duration, token] = decoded.args;

    return [{ label, duration, token }];
  });

  const prices = await Promise.all(
    registrationCalls.map(async ({ label, duration, token }) => {
      const [base, premium] = await config.publicClient.readContract({
        address: registrar,
        abi: ethRegistrarV2Abi,
        functionName: "getRegisterPrice",
        args: [label, duration, token],
      });

      return { token, amount: base + premium };
    }),
  );

  const tokens = [...new Set(prices.map(({ token }) => token.toLowerCase() as `0x${string}`))];
  const registrationFees = await Promise.all(
    tokens.map(async (token) => {
      let allowance = await config.publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [plan.account.address, registrar],
      });

      for (const approval of plan.calls.filter((entry) => same(entry.to, token))) {
        const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data });

        if (decoded.functionName === "approve" && same(decoded.args[0], registrar))
          allowance += decoded.args[1];
      }

      return {
        kind: "registration" as const,
        chainId: config.chainId,
        token,
        expected: prices
          .filter((price) => same(price.token, token))
          .reduce((sum, price) => sum + price.amount, 0n),
        maximum: allowance,
        sponsored: false,
      };
    }),
  );

  fees.push(...registrationFees);

  if (refund) {
    const balance = await config.publicClient.readContract({
      address: refund.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [plan.account.address],
    });

    const registrationCost = registrationFees
      .filter((fee) => same(fee.token, refund.token))
      .reduce((sum, fee) => sum + fee.expected, 0n);

    if (balance < maximum + registrationCost)
      return reject("Prefund the HCA for registration and its full refund cap");
  }

  const message = getTypedData(
    plan.account.address,
    profile.infrastructure.intentExecutor,
    element,
    BigInt(op.nonce),
  );

  message.message.gasRefund ??= { token: zeroAddress, exchangeRate: 0n, overhead: 0n };
  const scopeHash = hashTypedData(message);

  return { fees, expiresAt, scopeHash };
};
