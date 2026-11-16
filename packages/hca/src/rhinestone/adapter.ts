import { Effect, Schema } from "effect";

import { standaloneHcaV2SignatureAbi } from "@ensforge/contracts/internal";
import { defineAction, HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import {
  HcaExecutionHash,
  type PreparedHcaCalls,
  type HcaExecutionReview,
} from "@ensforge/core/legacy/hca";
import {
  RhinestoneSDK,
  type RhinestoneAccount,
  type PreparedTransactionData,
  type SignedTransactionData,
} from "@rhinestone/sdk";
import { getPermissionId } from "@rhinestone/sdk/smart-sessions";
import { concat, keccak256, stringToHex, zeroAddress } from "viem";

import { createExecutionAdapter } from "../create-execution-adapter.js";
import type { TypedExecutionAdapter } from "../types.js";
import { createRhinestoneHca, sessionFor } from "./account.js";
import { createRhinestoneCrossChain } from "./cross-chain/index.js";
import type { RhinestoneCrossChain } from "./cross-chain/types.js";
import { reviewRoute } from "./route.js";
import { createRhinestoneSessions } from "./sessions.js";
import type {
  RhinestoneOptions,
  RhinestoneSessions,
  RhinestoneExecutionPayload,
  RhinestoneSubmissionPayload,
} from "./types.js";

interface LocalOperation {
  readonly plan: PreparedHcaCalls;
  readonly account: RhinestoneAccount;
  readonly prepared: PreparedTransactionData;
  readonly scopeHash: `0x${string}`;
  readonly expiresAt: bigint;
  signed?: SignedTransactionData;
}

export type RhinestoneExecutionAdapter = TypedExecutionAdapter<
  RhinestoneExecutionPayload,
  RhinestoneExecutionPayload,
  RhinestoneSubmissionPayload,
  { readonly sessions: RhinestoneSessions }
> & { readonly crossChain: RhinestoneCrossChain };

/** A destination-session adapter for the recorded standalone HCA generation. */
export const rhinestone = (input: RhinestoneOptions): RhinestoneExecutionAdapter => {
  const options = {
    ...input,
    profile: structuredClone(input.profile),
    ...(input.crossChain === undefined
      ? {}
      : {
          crossChain: {
            ...input.crossChain,
            routes: structuredClone(input.crossChain.routes),
            sourceClients: { ...input.crossChain.sourceClients },
          },
        }),
  };

  if (options.chain.id !== options.profile.deployment.chainId)
    throw new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "Rhinestone chain and HCA profile must match",
    });

  if (options.sdk.useDevContracts)
    throw new HcaError({
      code: "UNSUPPORTED_DEPLOYMENT",
      message: "Use the verified HCA profile rather than Rhinestone dev-contract defaults",
    });

  const sdk = new RhinestoneSDK(options.sdk);
  const operations = new Map<string, LocalOperation>();
  const configurationFingerprint = keccak256(
    stringToHex(
      JSON.stringify({
        provider: "rhinestone-1.8.0-ensforge-2",
        endpoint:
          options.sdk.endpointUrl === undefined
            ? "default"
            : new URL(options.sdk.endpointUrl).origin,
        chainId: options.chain.id,
        contracts: options.profile.contracts,
        infrastructure: options.profile.infrastructure,
        owner: options.owner.address,
        sessionSigner: options.sessionSigner.address,
        sponsored: options.sponsored ?? true,
      }),
    ),
  );

  const payload = Schema.Struct({ id: Schema.NonEmptyString, scopeHash: HcaExecutionHash });

  const getOperation = (reference: RhinestoneExecutionPayload) => {
    const operation = operations.get(reference.id);

    if (!operation || operation.scopeHash !== reference.scopeHash)
      throw new HcaError({
        code: "ADAPTER_MISMATCH",
        message: "SDK signing state is not available in this adapter instance",
      });

    return operation;
  };

  const verifySignature = async (config: EnsforgeConfig, operation: LocalOperation) => {
    const signed = operation.signed;
    const signature = signed?.targetExecutionSignature;

    if (!signed || !signature)
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "SDK did not produce a destination session signature",
      });

    const signatures = [signature, ...signed.originSignatures, signed.destinationSignature];

    if (
      signed.originSignatures.length !== 1 ||
      signatures.some((entry) => typeof entry !== "string")
    )
      throw new HcaError({
        code: "INVALID_EXECUTION",
        message: "Expected one same-chain session signature per envelope",
      });

    await Promise.all(
      [...new Set(signatures)].map(async (envelope) => {
        if (typeof envelope !== "string") return;

        const magic = await config.publicClient.readContract({
          address: operation.plan.account.address,
          account: options.profile.infrastructure.intentExecutor,
          abi: standaloneHcaV2SignatureAbi,
          functionName: "isValidSignature",
          args: [operation.scopeHash, envelope],
        });

        if (magic !== "0x1626ba7e")
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Deployed HCA rejected an SDK envelope for the reviewed execution nonce",
          });
      }),
    );
  };

  const revalidateOperation = async (
    config: EnsforgeConfig,
    operation: LocalOperation,
    accepted: HcaExecutionReview,
  ) => {
    const fresh = await reviewRoute(options, config, operation.plan, operation.prepared);

    if (fresh.scopeHash !== operation.scopeHash || fresh.expiresAt < operation.expiresAt)
      throw new HcaError({ code: "ADAPTER_MISMATCH", message: "SDK route changed; prepare again" });

    for (const fee of fresh.fees) {
      const sameFee = (entry: typeof fee) =>
        entry.kind === fee.kind &&
        entry.chainId === fee.chainId &&
        entry.token.toLowerCase() === fee.token.toLowerCase();

      const maximum = accepted.fees.filter(sameFee).reduce((sum, entry) => sum + entry.maximum, 0n);
      const current = fresh.fees.filter(sameFee).reduce((sum, entry) => sum + entry.maximum, 0n);

      if (current > maximum || fee.expected > maximum)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Current fees or allowance exceed the reviewed bounds; prepare again",
        });
    }

    await config.publicClient.call({
      account: operation.plan.account.owner,
      to: operation.plan.account.address,
      data: operation.plan.data,
      value: operation.plan.value,
    });
  };

  const adapter = createExecutionAdapter({
    id: "rhinestone",
    chainId: options.chain.id,
    profileId: options.profile.generation.id,
    configurationFingerprint,
    capabilities: {
      ownerExecution: false,
      sessionExecution: true,
      atomicBatching: true,
      sponsorship: true,
      counterfactualDeployment: false,
      crossChainFunding: false,
    },
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    extensions: { sessions: createRhinestoneSessions(options, sdk) },
    schemas: { prepared: payload, authorized: payload },
    submission: {
      version: 1,
      schema: Schema.Struct({
        intentId: Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/)),
      }),
    },
    supports: (plan) => ({
      supported: plan.authorization.kind === "session" && plan.session !== undefined,
      reason:
        "Rhinestone requires a confirmed destination session; omit the adapter for direct owner execution",
    }),
    prepare: defineAction((config, plan) =>
      Effect.tryPromise({
        try: async () => {
          for (const [id, operation] of operations)
            if (operation.expiresAt <= BigInt(Math.floor(Date.now() / 1000))) operations.delete(id);

          const { rhinestoneAccount: account } = await createRhinestoneHca(
            options,
            sdk,
            config,
            plan.account.address,
            plan.account.salt,
          );

          if (!plan.session)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "A signed session authorization is required",
            });

          const session = sessionFor(options, plan.account.address, plan.session.salt);

          if (
            getPermissionId(session).toLowerCase() !== plan.session.permissionId.toLowerCase() ||
            options.sessionSigner.address.toLowerCase() !== plan.session.sessionKey.toLowerCase()
          )
            throw new HcaError({
              code: "ADAPTER_MISMATCH",
              message:
                "Configured SDK session signer or permission ID differs from the enabled session",
            });

          const prepared = await account.prepareTransaction({
            chain: options.chain,
            calls: plan.calls.map((call) => ({ ...call })),
            sponsored: options.sponsored ?? true,
            ...(options.sponsored === false ? { feeAsset: plan.session.refund.token } : {}),
            // The API selects same-chain routes automatically; reviewRoute verifies the result.
            signers: {
              type: "experimental_session",
              // HCA policies are enforced by its validator, so the session has no explicit actions.
              verifyExecutions: true,
              session,
              enableData: {
                // Rhinestone wraps owner signatures with the HCA owner-validator selector.
                userSignature: concat([zeroAddress, plan.session.ownerSignature]),
                hashesAndChainIds: [
                  { chainId: BigInt(config.chainId), sessionDigest: plan.session.sessionDigest },
                ],
                sessionToEnableIndex: 0,
                hcaSessionNonce: plan.session.sessionNonce,
                hcaSessionConfig: {
                  sessionKey: plan.session.sessionKey,
                  validUntil: plan.session.validUntil,
                  resolver: plan.session.resolver,
                  refundToken: plan.session.refund.token,
                  maxRefundExchangeRate: plan.session.refund.maxExchangeRate,
                  maxRefundGasOverhead: Number(plan.session.refund.maxGasOverhead),
                  maxRefundAmount: plan.session.refund.maxAmount,
                },
              },
            },
          });

          const review = await reviewRoute(options, config, plan, prepared);
          await config.publicClient.call({
            account: plan.account.owner,
            to: plan.account.address,
            data: plan.data,
            value: plan.value,
          });

          const id = crypto.randomUUID();
          operations.set(id, {
            plan,
            account,
            prepared,
            scopeHash: review.scopeHash,
            expiresAt: review.expiresAt,
          });

          return {
            payload: { id, scopeHash: review.scopeHash },
            review: {
              expiresAt: review.expiresAt,
              fees: review.fees,
              authorizations: [
                {
                  kind: "typed-data" as const,
                  signer: plan.session.sessionKey,
                  scopeHash: review.scopeHash,
                  description: "Rhinestone fixed ENS destination-session operation",
                },
              ],
              simulation: {
                scope: "complete-operation" as const,
                chainId: config.chainId,
                hca: plan.account.address,
                evidence:
                  "Exact destination batch simulated through executeByOwner; fixed session policy and bounded refund checked. ERC-1271 signature checked after signing and before submission.",
              },
            },
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
    authorize: defineAction((config, prepared) =>
      Effect.tryPromise({
        try: async () => {
          const operation = getOperation(prepared.payload);
          await revalidateOperation(config, operation, prepared.review);
          // No-funding routes have no independent origin execution. Sign every envelope for
          // the same-chain origin nonce, but submit the original, unmodified provider quote.
          const quoted = operation.prepared;
          const signing = {
            ...quoted,
            intentRoute: structuredClone(quoted.intentRoute),
          };
          const op = signing.intentRoute.intentOp;
          op.targetExecutionNonce = op.nonce;
          const settlement = op.elements[0]?.mandate.qualifier.settlementContext;
          if (settlement)
            settlement.gasRefund ??= { token: zeroAddress, exchangeRate: 0n, overhead: 0n };

          const signed = await operation.account.signTransaction(signing);
          operation.signed = { ...signed, intentRoute: quoted.intentRoute };
          await verifySignature(config, operation);

          return prepared.payload;
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
    submit: defineAction((config, authorized) =>
      Effect.tryPromise({
        try: async () => {
          const operation = getOperation(authorized.payload);
          await revalidateOperation(config, operation, authorized.review);
          await verifySignature(config, operation);

          if (!operation.signed)
            throw new HcaError({ code: "INVALID_EXECUTION", message: "Missing SDK authorization" });

          const result = await operation.account.submitTransaction(operation.signed);
          operations.delete(authorized.payload.id);

          if (
            result.type !== "intent" ||
            result.targetChain !== config.chainId ||
            result.sourceChains?.some((chain) => chain !== config.chainId)
          )
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "Provider returned another execution route",
            });

          const intentId = result.id.toString();

          return {
            reference: intentId,
            locator: { kind: "intent" as const, provider: "rhinestone", requestId: intentId },
            payload: { intentId },
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
    getStatus: defineAction((config, submission) =>
      Effect.tryPromise({
        try: async () => {
          if (
            submission.reference !== submission.payload.intentId ||
            submission.locator.kind !== "intent" ||
            submission.locator.provider !== "rhinestone" ||
            submission.locator.requestId !== submission.payload.intentId
          )
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "Intent tracking reference mismatch",
            });

          const result = await sdk.getIntentStatus(BigInt(submission.payload.intentId));

          if (result.fill.chainId !== config.chainId)
            throw new HcaError({
              code: "ADAPTER_MISMATCH",
              message: "Provider status belongs to another destination",
            });

          if (result.fill.hash) {
            const receipt = await config.publicClient.getTransactionReceipt({
              hash: result.fill.hash,
            });

            return {
              status: receipt.status === "success" ? ("succeeded" as const) : ("failed" as const),
              receipts: [receipt],
            };
          }

          if (result.status === "EXPIRED")
            return {
              status: "expired" as const,
              reason: "Rhinestone intent expired without a destination fill",
            };

          // FAILED without an on-chain receipt is uncertain, not permission to resubmit.
          return {
            status:
              result.status === "PENDING" || result.status === "PRECONFIRMED"
                ? ("pending" as const)
                : ("unknown" as const),
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
  });

  return Object.freeze({ ...adapter, crossChain: createRhinestoneCrossChain(options, sdk) });
};
