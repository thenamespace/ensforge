import { Effect } from "effect";

import { isAddressEqual } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { HcaError } from "../../../errors/hca-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { hcaRpc } from "../../../internal/hca/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { WriteClient } from "../../../internal/write/write-client.js";
import type { WriteError } from "../../../write/types.js";
import { prepareHcaCalls } from "../prepare-hca-calls/index.js";
import type { HcaTransactionSubmission, PrepareHcaCallsParameters } from "../types.js";
import type {
  ExecuteHcaCallsParameters,
  HcaExecutionSubmission,
  HcaExecutionIdentity,
  ExecutionAdapter,
  PreparedHcaCalls,
} from "../types.js";
import { verifyHca } from "../verify-hca/index.js";

export const checkHcaAdapterIdentity = (
  execution: ExecutionAdapter,
  plan: PreparedHcaCalls,
  identity: HcaExecutionIdentity,
) => {
  if (
    identity.operationId !== plan.operationId ||
    identity.adapterId !== execution.id ||
    identity.instanceId !== execution.instanceId ||
    identity.chainId !== plan.account.chainId ||
    identity.hca.toLowerCase() !== plan.account.address.toLowerCase() ||
    identity.profileId !== plan.account.profileId ||
    identity.planFingerprint !== plan.fingerprint
  ) {
    throw new HcaError({
      code: "ADAPTER_MISMATCH",
      message: "Adapter payload belongs to another account, plan, chain or adapter instance",
    });
  }
};

const checkIdentity = (
  execution: ExecutionAdapter,
  plan: PreparedHcaCalls,
  identity: HcaExecutionIdentity,
) =>
  Effect.try({
    try: () => checkHcaAdapterIdentity(execution, plan, identity),
    catch: () =>
      new HcaError({
        code: "ADAPTER_MISMATCH",
        message: "Adapter returned an invalid execution identity",
      }),
  });

export interface ExecuteHcaCallsAction {
  <Adapter extends ExecutionAdapter>(
    config: EnsforgeConfig,
    parameters: PrepareHcaCallsParameters & { readonly execution: Adapter },
    options?: Effect.RunOptions,
  ): Promise<Awaited<ReturnType<Adapter["submit"]>>>;
  (
    config: EnsforgeConfig,
    parameters: PrepareHcaCallsParameters & { readonly execution?: never },
    options?: Effect.RunOptions,
  ): Promise<HcaTransactionSubmission>;
  (
    config: EnsforgeConfig,
    parameters: ExecuteHcaCallsParameters,
    options?: Effect.RunOptions,
  ): Promise<HcaExecutionSubmission>;

  readonly effect: {
    <Adapter extends ExecutionAdapter>(
      config: EnsforgeConfig,
      parameters: PrepareHcaCallsParameters & { readonly execution: Adapter },
    ): Effect.Effect<Awaited<ReturnType<Adapter["submit"]>>, WriteError>;
    (
      config: EnsforgeConfig,
      parameters: PrepareHcaCallsParameters & { readonly execution?: never },
    ): Effect.Effect<HcaTransactionSubmission, WriteError>;
    (
      config: EnsforgeConfig,
      parameters: ExecuteHcaCallsParameters,
    ): Effect.Effect<HcaExecutionSubmission, WriteError>;
  };
}

export const executeHcaCalls: ExecuteHcaCallsAction = defineAction<
  ExecuteHcaCallsParameters,
  HcaExecutionSubmission,
  WriteError
>(
  Effect.fn("ensforge.executeHcaCalls")(function* (config, parameters) {
    const plan = yield* prepareHcaCalls.effect(config, parameters);
    const execution = parameters.execution;

    if (
      parameters.requiredCapabilities?.some(
        (capability) => execution?.capabilities?.[capability] !== true,
      )
    )
      return yield* new HcaError({
        code: "UNSUPPORTED_CAPABILITY",
        message: "Execution adapter does not provide every requested capability",
      });

    if (execution !== undefined) {
      const support = yield* Effect.try({
        try: () => execution.supports(plan),
        catch: () =>
          new HcaError({ code: "ADAPTER_FAILED", message: "Adapter compatibility check failed" }),
      });

      if (!support.supported)
        return yield* new HcaError({
          code: "UNSUPPORTED_AUTHORIZATION",
          message: support.reason ?? "Adapter does not support this HCA owner operation",
        });

      const prepared = yield* execution.prepare.effect(config, plan);
      yield* checkIdentity(execution, plan, prepared);

      if (prepared.simulation !== "succeeded")
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "Adapter must simulate the complete operation before authorization",
        });

      const authorized = yield* execution.authorize.effect(config, prepared);
      yield* checkIdentity(execution, plan, authorized);
      yield* verifyHca.effect(config, {
        hca: plan.account.address,
        expectedOwner: plan.account.owner,
        allowUndeployed: plan.account.deployed === false,
        salt: plan.account.salt,
      });

      const submission = yield* execution.submit.effect(config, authorized);
      yield* checkIdentity(execution, plan, submission);

      if (submission.kind !== "adapter" || !submission.reference)
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "Adapter submitted without a tracking reference; reconcile before retrying",
        });

      return submission;
    }

    if (plan.account.deployed === false)
      return yield* new HcaError({
        code: "ACCOUNT_UNDEPLOYED",
        message: "Deploy the HCA first or use an adapter with counterfactual deployment",
      });

    if (plan.authorization.kind !== "owner")
      return yield* new HcaError({
        code: "UNSUPPORTED_AUTHORIZATION",
        message: "Session execution requires an execution adapter",
      });

    const { walletClient, account } = yield* provideConfig(
      config,
      resolveWalletContext(parameters),
    );

    const owner = typeof account === "string" ? account : account.address;

    if (!isAddressEqual(owner, plan.account.owner))
      return yield* new HcaError({
        code: "OWNER_MISMATCH",
        message: "Direct HCA execution requires the immutable owner wallet",
      });

    const walletChain = yield* hcaRpc(() => walletClient.getChainId());

    if (walletChain !== config.chainId)
      return yield* new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "The connected wallet changed networks",
      });

    const client = yield* provideConfig(config, WriteClient);

    const call = {
      id: "hca-owner",
      operation: "executeHcaCalls",
      account,
      chainId: config.chainId,
      to: plan.account.address,
      data: plan.data,
      value: plan.value,
    };

    yield* client.simulate(call);

    const hash = yield* client.sendTransaction(walletClient, call);

    return {
      kind: "transaction",
      ...(plan.operationId === undefined ? {} : { operationId: plan.operationId }),
      chainId: config.chainId,
      hca: plan.account.address,
      owner: plan.account.owner,
      profileId: plan.account.profileId,
      hash,
      planFingerprint: plan.fingerprint,
    };
  }),
) as ExecuteHcaCallsAction;
