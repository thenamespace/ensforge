import { Effect, Schema } from "effect";

import { standaloneHcaV2UserOperationAbi } from "@ensforge/contracts/internal";
import { defineAction, HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import { HcaExecutionHash, type PreparedHcaCalls } from "@ensforge/core/legacy/hca";
import { createSmartAccountClient } from "permissionless";
import {
  custom,
  isAddressEqual,
  keccak256,
  parseEventLogs,
  stringToHex,
  verifyMessage,
} from "viem";
import {
  entryPoint07Abi,
  UserOperationReceiptNotFoundError,
  type UserOperation,
} from "viem/account-abstraction";

import { createExecutionAdapter } from "../create-execution-adapter.js";
import type { TypedExecutionAdapter } from "../types.js";
import { createPimlicoAccount } from "./account.js";
import { hashOperation } from "./operation.js";
import type { PimlicoOptions, PimlicoExecutionPayload, PimlicoSubmissionPayload } from "./types.js";

interface LocalOperation {
  readonly plan: PreparedHcaCalls;
  readonly operation: UserOperation<"0.7">;
  readonly expiresAt: bigint;
  signature?: `0x${string}`;
  attempted?: boolean;
}

export type PimlicoExecutionAdapter = TypedExecutionAdapter<
  PimlicoExecutionPayload,
  PimlicoExecutionPayload,
  PimlicoSubmissionPayload
>;

export const pimlico = (input: PimlicoOptions): PimlicoExecutionAdapter => {
  const options = {
    ...input,
    owner: { ...input.owner },
    profile: structuredClone(input.profile),
    ...(input.sponsorship ? { sponsorship: { ...input.sponsorship } } : {}),
  };

  const lifetime = options.reviewLifetimeSeconds ?? 300;

  if (
    options.chain.id !== options.profile.deployment.chainId ||
    !Number.isSafeInteger(lifetime) ||
    lifetime <= 0
  )
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Pimlico requires a matching chain and a positive review lifetime",
    });

  const operations = new Map<string, LocalOperation>();
  const configurationFingerprint = keccak256(
    stringToHex(
      JSON.stringify({
        provider: "pimlico-permissionless-0.4",
        chainId: options.chain.id,
        contracts: options.profile.contracts,
        infrastructure: options.profile.infrastructure,
        owner: options.owner.address.toLowerCase(),
        sponsored: Boolean(options.sponsorship),
        reviewLifetimeSeconds: lifetime,
      }),
    ),
  );

  const payload = Schema.Struct({ id: Schema.NonEmptyString, userOperationHash: HcaExecutionHash });

  const getOperation = (reference: PimlicoExecutionPayload) => {
    const operation = operations.get(reference.id);

    if (!operation || hashOperation(options, operation.operation) !== reference.userOperationHash)
      throw new HcaError({
        code: "ADAPTER_MISMATCH",
        message: "UserOperation signing state is unavailable or changed",
      });

    if (operation.expiresAt <= BigInt(Math.floor(Date.now() / 1000)))
      throw new HcaError({
        code: "EXECUTION_EXPIRED",
        message: "Prepare a fresh UserOperation review",
      });

    return operation;
  };

  const checkNetwork = async (config: EnsforgeConfig) => {
    const chainId = Number(await options.client.request({ method: "eth_chainId" }));

    if (chainId !== config.chainId || options.chain.id !== config.chainId)
      throw new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "Pimlico bundler is connected to another chain",
      });

    const entries = await options.client.getSupportedEntryPoints();

    if (
      !entries.some((address) => isAddressEqual(address, options.profile.infrastructure.entryPoint))
    )
      throw new HcaError({
        code: "UNSUPPORTED_DEPLOYMENT",
        message: "Bundler does not support the HCA EntryPoint",
      });

    const code = await config.publicClient.getCode({
      address: options.profile.infrastructure.entryPoint,
    });

    if (!code || code === "0x")
      throw new HcaError({
        code: "UNSUPPORTED_DEPLOYMENT",
        message: "HCA EntryPoint has no deployed code",
      });
  };

  const revalidate = async (config: EnsforgeConfig, local: LocalOperation) => {
    await checkNetwork(config);
    const account = await createPimlicoAccount(options, config, local.plan);
    const factory = await account.getFactoryArgs();

    if (
      (await account.getNonce()) !== local.operation.nonce ||
      factory.factory !== local.operation.factory ||
      factory.factoryData !== local.operation.factoryData
    )
      throw new HcaError({
        code: "ACCOUNT_MISMATCH",
        message: "HCA nonce or deployment state changed; prepare again",
      });

    if (!options.sponsorship) {
      const op = local.operation;
      const requiredPrefund =
        (op.preVerificationGas +
          op.verificationGasLimit +
          op.callGasLimit +
          (op.paymasterVerificationGasLimit ?? 0n) +
          (op.paymasterPostOpGasLimit ?? 0n)) *
        op.maxFeePerGas;
      const [balance, deposit] = await Promise.all([
        config.publicClient.getBalance({ address: local.plan.account.address }),
        config.publicClient.readContract({
          address: options.profile.infrastructure.entryPoint,
          abi: entryPoint07Abi,
          functionName: "balanceOf",
          args: [local.plan.account.address],
        }),
      ]);

      // Call value comes from the account balance; EntryPoint deposits only pay for gas.
      if (balance < local.plan.value || deposit + balance - local.plan.value < requiredPrefund)
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Insufficient HCA funds for the UserOperation prefund and call value",
          cause: { balance, deposit, requiredPrefund, callValue: local.plan.value },
        });
    }

    const estimate = await options.client.estimateUserOperationGas({
      ...local.operation,
      signature: local.signature ?? local.operation.signature,
      entryPointAddress: options.profile.infrastructure.entryPoint,
    });

    for (const key of [
      "callGasLimit",
      "verificationGasLimit",
      "preVerificationGas",
      "paymasterVerificationGasLimit",
      "paymasterPostOpGasLimit",
    ] as const)
      if ((estimate[key] ?? 0n) > (local.operation[key] ?? 0n))
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Gas requirements exceed the reviewed operation; prepare again",
        });
  };

  return createExecutionAdapter({
    id: "pimlico",
    chainId: options.chain.id,
    profileId: options.profile.generation.id,
    configurationFingerprint,
    capabilities: {
      ownerExecution: true,
      sessionExecution: false,
      atomicBatching: true,
      sponsorship: Boolean(options.sponsorship),
      counterfactualDeployment: true,
      crossChainFunding: false,
    },
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    schemas: { prepared: payload, authorized: payload },
    submission: { version: 1, schema: Schema.Struct({ userOperationHash: HcaExecutionHash }) },
    supports: (plan) => ({
      supported:
        plan.authorization.kind === "owner" &&
        isAddressEqual(plan.account.owner, options.owner.address),
      reason:
        "Pimlico requires the immutable owner signer; ENS intent sessions are not UserOperation authorization",
    }),
    prepare: defineAction((config, plan) =>
      Effect.tryPromise({
        try: async () => {
          for (const [id, local] of operations)
            if (local.expiresAt <= BigInt(Math.floor(Date.now() / 1000))) operations.delete(id);

          await checkNetwork(config);

          if (
            !isAddressEqual(
              plan.account.currentImplementation,
              options.profile.contracts.standaloneImplementation,
            )
          )
            throw new HcaError({
              code: "ACCOUNT_MISMATCH",
              message: "HCA profile differs from the verified account",
            });

          const entryPoint = await config.publicClient.readContract({
            address: plan.account.currentImplementation,
            abi: standaloneHcaV2UserOperationAbi,
            functionName: "entryPoint",
          });

          if (!isAddressEqual(entryPoint, options.profile.infrastructure.entryPoint))
            throw new HcaError({
              code: "DEPLOYMENT_MISMATCH",
              message: "HCA uses another EntryPoint",
            });

          const account = await createPimlicoAccount(options, config, plan);
          const paymaster = options.sponsorship
            ? (options.sponsorship.client ?? options.client)
            : undefined;

          const client = createSmartAccountClient({
            account,
            chain: options.chain,
            client: config.publicClient,
            bundlerTransport: custom(
              { request: (request) => options.client.request(request, { retryCount: 0 }) },
              { retryCount: 0 },
            ),
            ...(paymaster
              ? {
                  paymaster: {
                    getPaymasterData: paymaster.getPaymasterData,
                    getPaymasterStubData: paymaster.getPaymasterStubData,
                  },
                }
              : {}),
            ...(options.sponsorship?.policyId
              ? { paymasterContext: { sponsorshipPolicyId: options.sponsorship.policyId } }
              : {}),
            userOperation: {
              estimateFeesPerGas: async () =>
                (await options.client.getUserOperationGasPrice()).fast,
            },
          });

          const prepared = await client.prepareUserOperation({ calls: plan.calls });
          const operation: UserOperation<"0.7"> = {
            ...prepared,
            signature: await account.getStubSignature(),
          };

          if (Boolean(operation.paymaster) !== Boolean(options.sponsorship))
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Paymaster response did not provide the requested sponsorship",
            });

          if (
            operation.callData !== (await account.encodeCalls(plan.calls)) ||
            !isAddressEqual(operation.sender, plan.account.address)
          )
            throw new HcaError({
              code: "ADAPTER_MISMATCH",
              message: "Prepared UserOperation changed the reviewed calls",
            });

          const id = crypto.randomUUID();
          const local = {
            plan,
            operation: Object.freeze(operation),
            expiresAt: BigInt(Math.floor(Date.now() / 1000) + lifetime),
          };

          await revalidate(config, local);
          const userOperationHash = hashOperation(options, operation);
          operations.set(id, local);
          const maximum = options.sponsorship
            ? 0n
            : (operation.preVerificationGas +
                operation.verificationGasLimit +
                operation.callGasLimit +
                (operation.paymasterVerificationGasLimit ?? 0n) +
                (operation.paymasterPostOpGasLimit ?? 0n)) *
              operation.maxFeePerGas;

          return {
            payload: { id, userOperationHash },
            review: {
              expiresAt: local.expiresAt,
              fees: [
                {
                  kind: "execution" as const,
                  chainId: config.chainId,
                  token: "native" as const,
                  expected: maximum,
                  maximum,
                  sponsored: Boolean(options.sponsorship),
                },
              ],
              authorizations: [
                {
                  kind: "message" as const,
                  signer: plan.account.owner,
                  scopeHash: userOperationHash,
                  description:
                    "Owner-signed HCA UserOperation; review expiry is local and does not expire an already signed operation on-chain",
                },
              ],
              simulation: {
                scope: "complete-operation" as const,
                chainId: config.chainId,
                hca: plan.account.address,
                evidence:
                  "Bundler estimated the exact atomic HCA UserOperation, including factory and paymaster when present",
              },
            },
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({ code: "ADAPTER_FAILED", message: "Pimlico operation failed", cause }),
      }),
    ),
    authorize: defineAction((config, prepared) =>
      Effect.tryPromise({
        try: async () => {
          const local = getOperation(prepared.payload);
          await revalidate(config, local);
          const signature = await options.owner.signMessage({
            message: { raw: prepared.payload.userOperationHash },
          });

          if (
            !(await verifyMessage({
              address: local.plan.account.owner,
              message: { raw: prepared.payload.userOperationHash },
              signature,
            }))
          )
            throw new HcaError({
              code: "OWNER_MISMATCH",
              message: "Signer did not produce the verified owner's signature",
            });

          local.signature = signature;
          await revalidate(config, local);
          getOperation(prepared.payload);

          return prepared.payload;
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({ code: "ADAPTER_FAILED", message: "Pimlico operation failed", cause }),
      }),
    ),
    submit: defineAction((config, authorized) =>
      Effect.tryPromise({
        try: async () => {
          const local = getOperation(authorized.payload);

          if (!local.signature || local.attempted)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "UserOperation is unsigned or submission has already been attempted",
            });

          await revalidate(config, local);

          if (local.attempted)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Submission is already in progress",
            });

          getOperation(authorized.payload);
          local.attempted = true;
          // Submit the exact signed operation without another preparation or an automatic retry.
          const hash = await options.client.sendUserOperation({
            ...local.operation,
            signature: local.signature,
            entryPointAddress: options.profile.infrastructure.entryPoint,
          });

          if (hash !== authorized.payload.userOperationHash)
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "Bundler returned a different UserOperation hash",
            });

          operations.delete(authorized.payload.id);

          return {
            reference: hash,
            payload: { userOperationHash: hash },
            locator: {
              kind: "user-operation" as const,
              chainId: config.chainId,
              entryPoint: options.profile.infrastructure.entryPoint,
              hash,
            },
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({ code: "ADAPTER_FAILED", message: "Pimlico operation failed", cause }),
      }),
    ),
    getStatus: defineAction((config, submission) =>
      Effect.tryPromise({
        try: async () => {
          const hash = submission.payload.userOperationHash;

          if (
            submission.reference !== hash ||
            submission.locator.kind !== "user-operation" ||
            submission.locator.hash !== hash ||
            submission.locator.chainId !== config.chainId ||
            !isAddressEqual(
              submission.locator.entryPoint,
              options.profile.infrastructure.entryPoint,
            )
          )
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "UserOperation tracking reference mismatch",
            });

          await checkNetwork(config);
          let result;

          try {
            result = await options.client.getUserOperationReceipt({ hash });
          } catch (cause) {
            // Provider clients can load another Viem copy or its CommonJS build.
            if (
              cause instanceof UserOperationReceiptNotFoundError ||
              (cause instanceof Error && cause.name === "UserOperationReceiptNotFoundError")
            )
              return { status: "unknown" as const };

            throw cause;
          }

          if (
            !isAddressEqual(result.sender, submission.hca) ||
            !isAddressEqual(result.entryPoint, options.profile.infrastructure.entryPoint) ||
            result.userOpHash !== hash
          )
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "Bundler receipt belongs to another operation",
            });

          const receipt = await config.publicClient.getTransactionReceipt({
            hash: result.receipt.transactionHash,
          });

          const events = parseEventLogs({
            abi: entryPoint07Abi,
            eventName: "UserOperationEvent",
            logs: receipt.logs.filter((log) =>
              isAddressEqual(log.address, options.profile.infrastructure.entryPoint),
            ),
          });

          const event = events.find(
            (log) =>
              log.args.userOpHash === hash && isAddressEqual(log.args.sender, submission.hca),
          );

          if (!event || event.args.success !== result.success)
            throw new HcaError({
              code: "INVALID_SUBMISSION",
              message: "Bundler outcome does not match the on-chain UserOperation event",
            });

          return {
            status:
              event.args.success && receipt.status === "success"
                ? ("succeeded" as const)
                : ("failed" as const),
            receipts: [receipt],
          };
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({ code: "ADAPTER_FAILED", message: "Pimlico operation failed", cause }),
      }),
    ),
  });
};
