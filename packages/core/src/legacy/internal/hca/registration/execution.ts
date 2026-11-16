import { Effect, Schema } from "effect";

import { erc20Abi, type Address } from "viem";

import { checkHcaAdapterIdentity } from "../../../actions/hca/execute-hca-calls/index.js";
import { HcaExecutionReview } from "../../../actions/hca/execution-contract.js";
import type {
  HcaRegistrationContext,
  HcaRegistrationOperation,
  HcaRegistrationProgress,
} from "../../../actions/hca/registration-types.js";
import type { HcaExecutionSubmission, PreparedHcaCalls } from "../../../actions/hca/types.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { HcaError } from "../../../errors/hca-error.js";
import { provideConfig } from "../../config/context.js";
import { resolveWalletContext } from "../../services/wallet-client.js";

export const prepareRegistrationExecution = async (
  config: EnsforgeConfig,
  context: HcaRegistrationContext,
  operation: HcaRegistrationOperation,
  plan: PreparedHcaCalls,
  signal: AbortSignal,
) => {
  const adapter = context.execution;

  if (adapter) {
    const prepared = await adapter.prepare(config, plan, { signal });
    checkHcaAdapterIdentity(adapter, plan, prepared);
    const review = Schema.decodeUnknownSync(HcaExecutionReview)(prepared.review);

    return {
      review,
      payload: prepared.payload,
      authorize: async () => {
        const authorized = await adapter.authorize(config, prepared, { signal });
        checkHcaAdapterIdentity(adapter, plan, authorized);

        return async (): Promise<HcaExecutionSubmission> => {
          const submission = await adapter.submit(config, authorized, { signal });
          checkHcaAdapterIdentity(adapter, plan, submission);

          return submission;
        };
      },
    };
  }

  if (operation.authorization.kind !== "owner")
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Session registration requires an execution adapter",
    });

  const { walletClient, account } = await Effect.runPromise(
    provideConfig(config, resolveWalletContext()),
    { signal },
  );

  const owner = typeof account === "string" ? account : account.address;

  if (
    owner.toLowerCase() !== operation.owner.toLowerCase() ||
    (await walletClient.getChainId()) !== config.chainId
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Direct registration requires the verified owner wallet on this network",
    });

  const transaction = { account, to: operation.hca, data: plan.data, value: 0n };
  const estimate = await config.publicClient.estimateGas(transaction);
  const gas = estimate + estimate / 5n;
  const fees = await config.publicClient.estimateFeesPerGas();
  const maximum = gas * fees.maxFeePerGas;
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 300);
  const operationId = plan.operationId;

  if (!operationId)
    throw new HcaError({ code: "INVALID_PARAMETERS", message: "Registration step ID is required" });

  const review: HcaExecutionReview = {
    expiresAt,
    fees: [
      {
        kind: "execution",
        chainId: config.chainId,
        token: "native",
        expected: maximum,
        maximum,
        sponsored: false,
      },
    ],
    authorizations: [
      {
        kind: "transaction",
        signer: operation.owner,
        description: "Atomic HCA registration step",
        scopeHash: plan.fingerprint,
      },
    ],
    simulation: {
      scope: "complete-operation",
      chainId: config.chainId,
      hca: operation.hca,
      evidence: "Estimated the complete owner transaction",
    },
  };

  return {
    review,
    payload: undefined,
    authorize: async () => async (): Promise<HcaExecutionSubmission> => {
      if (BigInt(Math.floor(Date.now() / 1000)) >= expiresAt)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Owner transaction review expired",
        });

      if ((await walletClient.getChainId()) !== config.chainId)
        throw new HcaError({ code: "INVALID_EXECUTION", message: "Owner wallet changed networks" });

      const hash = await walletClient.sendTransaction({
        ...transaction,
        chain: walletClient.chain,
        gas,
        ...fees,
      });

      return {
        kind: "transaction",
        operationId,
        chainId: config.chainId,
        hca: operation.hca,
        owner: operation.owner,
        profileId: operation.profileId,
        hash,
        planFingerprint: plan.fingerprint,
      };
    },
  };
};

export const checkRegistrationFees = async (
  config: EnsforgeConfig,
  context: HcaRegistrationContext,
  operation: HcaRegistrationOperation,
  review: HcaExecutionReview,
): Promise<HcaRegistrationProgress | undefined> => {
  if (
    review.simulation.chainId !== operation.chainId ||
    review.simulation.hca.toLowerCase() !== operation.hca.toLowerCase()
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Execution review belongs to another account or network",
    });

  const payments = new Map<Address | "native", bigint>();
  const checked = new Set<string>();

  for (const fee of review.fees) {
    const key = `${fee.kind}:${fee.chainId}:${fee.token.toLowerCase()}`;

    if (checked.has(key)) continue;

    checked.add(key);
    const same = (other: typeof fee) =>
      other.kind === fee.kind &&
      other.chainId === fee.chainId &&
      other.token.toLowerCase() === fee.token.toLowerCase();

    const maximum = review.fees.filter(same).reduce((sum, entry) => sum + entry.maximum, 0n);
    const limit =
      fee.kind === "registration" &&
      fee.token.toLowerCase() === operation.registration.paymentToken.toLowerCase() &&
      fee.chainId === operation.chainId
        ? operation.limits.registrationPrice
        : operation.limits.fees.find(
            (entry) =>
              entry.kind === fee.kind &&
              entry.chainId === fee.chainId &&
              entry.token.toLowerCase() === fee.token.toLowerCase(),
          )?.maximum;

    if (limit === undefined || maximum > limit)
      return {
        status: "needs-review",
        reason: `The ${fee.kind} fee exceeds the accepted limit for ${fee.token}`,
      };

    if (fee.chainId !== config.chainId)
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "Registration only supports destination-chain fees",
      });

    // Adapters validate native funding themselves, including EntryPoint deposits when supported.
    if (!fee.sponsored && maximum > 0n && !(context.execution && fee.token === "native")) {
      const token = fee.token.toLowerCase() as Address | "native";
      payments.set(token, (payments.get(token) ?? 0n) + maximum);
    }
  }

  const payer = context.execution ? operation.hca : operation.owner;
  const requirements = await Promise.all(
    [...payments].map(async ([token, maximum]) => {
      const balance =
        token === "native"
          ? await config.publicClient.getBalance({ address: payer })
          : await config.publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [payer],
            });

      return balance < maximum
        ? { status: "needs-funding" as const, token, required: maximum, balance }
        : undefined;
    }),
  );

  return requirements.find((requirement) => requirement !== undefined);
};
