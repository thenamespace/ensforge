import { Effect, Result } from "effect";

import { standaloneHcaFactoryV2DeploymentAbi } from "@ensforge/contracts/internal";
import {
  parseEventLogs,
  encodeFunctionData,
  isAddressEqual,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import { defineWriteAction } from "../../../action/write-intent.js";
import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { HcaError } from "../../../errors/hca-error.js";
import { TransactionError } from "../../../errors/transaction-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import {
  hcaRpc,
  resolveHcaProfile,
  validateHcaAddress,
  validateHcaSalt,
} from "../../../internal/hca/context.js";
import { verifyHcaDeployment } from "../../../internal/hca/verify-deployment.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { WriteClient } from "../../../internal/write/write-client.js";
import type { ConfirmationPolicy, WalletOverrides, WriteError } from "../../../write/types.js";
import { getHcaImplementationApproval } from "../get-hca-implementation-approval/index.js";
import { getHca } from "../get-hca/index.js";
import { predictHcaAddress } from "../predict-hca-address/index.js";
import { verifyHca } from "../verify-hca/index.js";

export interface DeployHcaParameters extends WalletOverrides {
  readonly owner: Address;
  readonly salt?: bigint;
  readonly implementation?: Address;
  readonly confirmation?: ConfirmationPolicy;
}

export type DeployHcaResult =
  | {
      readonly status: "already-deployed";
      readonly address: Address;
      readonly hash: Hex | null;
      readonly receipt: TransactionReceipt | null;
    }
  | {
      readonly status: "submitted";
      readonly address: Address;
      readonly hash: Hex;
      readonly receipt: null;
    }
  | {
      readonly status: "deployed";
      readonly address: Address;
      readonly hash: Hex;
      readonly receipt: TransactionReceipt;
    };

const prepareDeployment: EnsWriteIntentPreparer<DeployHcaParameters, WriteError> = Effect.fn(
  "prepareHcaDeployment",
)(function* (config, parameters) {
  const profile = yield* resolveHcaProfile(config);
  const owner = yield* validateHcaAddress(parameters.owner);
  const salt = yield* validateHcaSalt(parameters.salt ?? profile.generation.canonicalSalt);

  const implementation = yield* validateHcaAddress(
    parameters.implementation ?? profile.contracts.standaloneImplementation,
  );

  if (!isAddressEqual(implementation, profile.contracts.standaloneImplementation))
    return yield* new HcaError({
      code: "UNSUPPORTED_DEPLOYMENT",
      message: "This HCA initial implementation has not been verified",
    });

  yield* verifyHcaDeployment(config.publicClient, profile);

  // Approval gates new deployments; an existing certified account remains reusable.
  const state = yield* getHca.effect(config, {
    hca: yield* predictHcaAddress.effect(config, parameters),
  });

  if (
    state.status === "undeployed" &&
    !(yield* getHcaImplementationApproval.effect(config, { implementation }))
  )
    return yield* new HcaError({
      code: "UNSUPPORTED_DEPLOYMENT",
      message: "The initial HCA implementation is not approved for new deployments",
    });

  return {
    to: profile.contracts.standaloneFactory,
    value: 0n,
    protocol: "v2" as const,
    data: encodeFunctionData({
      abi: standaloneHcaFactoryV2DeploymentAbi,
      functionName: "deploy",
      args: [owner, implementation, salt],
    }),
  };
});

export const deployHca = defineWriteAction<DeployHcaParameters, DeployHcaResult, WriteError>(
  "deployHca",
  Effect.fn("ensforge.deployHca")(function* (config, parameters) {
    const address = yield* predictHcaAddress.effect(config, parameters);

    const verifyExisting = () =>
      verifyHca.effect(config, {
        hca: address,
        expectedOwner: parameters.owner,
        ...(parameters.salt === undefined ? {} : { salt: parameters.salt }),
        ...(parameters.implementation === undefined
          ? {}
          : { initialImplementation: parameters.implementation }),
      });

    const state = yield* getHca.effect(config, { hca: address });

    if (state.status === "deployed") {
      yield* verifyExisting();

      return { status: "already-deployed", address, hash: null, receipt: null };
    }

    const { walletClient, account } = yield* provideConfig(
      config,
      resolveWalletContext(parameters),
    );

    if ((yield* hcaRpc(() => walletClient.getChainId())) !== config.chainId)
      return yield* new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "The connected wallet changed networks",
      });

    const details = yield* prepareDeployment(config, parameters, {
      id: "hca-deploy",
      index: 0,
      account,
      chainId: config.chainId,
      walletClient,
    });

    const call = {
      ...details,
      id: "hca-deploy",
      operation: "deployHca",
      account,
      chainId: config.chainId,
    };

    const client = yield* provideConfig(config, WriteClient);
    const simulation = yield* Effect.result(client.simulate(call));

    if (Result.isFailure(simulation)) {
      const raced = yield* Effect.result(verifyExisting());

      if (Result.isSuccess(raced))
        return { status: "already-deployed", address, hash: null, receipt: null };

      return yield* simulation.failure;
    }

    const hash = yield* client.sendTransaction(walletClient, call);
    const confirmation = parameters.confirmation ?? config.writes.confirmation;

    if (confirmation.type === "submitted")
      return { status: "submitted", address, hash, receipt: null };

    const confirmed = yield* Effect.result(
      client.waitForReceipt(hash, {
        ...(confirmation.confirmations === undefined
          ? {}
          : { confirmations: confirmation.confirmations }),
        ...(confirmation.timeout === undefined ? {} : { timeout: confirmation.timeout }),
      }),
    );

    if (Result.isFailure(confirmed)) {
      if (
        confirmed.failure instanceof TransactionError &&
        confirmed.failure.code === "RECEIPT_REVERTED"
      ) {
        const raced = yield* Effect.result(verifyExisting());

        if (Result.isSuccess(raced)) {
          const receipt = yield* hcaRpc(() => config.publicClient.getTransactionReceipt({ hash }));

          return { status: "already-deployed", address, hash, receipt };
        }
      }

      return yield* confirmed.failure;
    }

    yield* verifyExisting();

    const profile = yield* resolveHcaProfile(config);
    // Reusing an account succeeds without HCADeployed, including a concurrent deployment.
    const created = parseEventLogs({
      abi: standaloneHcaFactoryV2DeploymentAbi,
      eventName: "HCADeployed",
      logs: confirmed.success.logs,
    }).some(
      (event) =>
        isAddressEqual(event.address, profile.contracts.standaloneFactory) &&
        isAddressEqual(event.args.hca, address),
    );

    return {
      status: created ? "deployed" : "already-deployed",
      address,
      hash,
      receipt: confirmed.success,
    };
  }),
  prepareDeployment,
);
