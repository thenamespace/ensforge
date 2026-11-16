import { Effect } from "effect";

import { verifiableFactoryV2ProxyLogicAbi } from "@ensforge/contracts/internal";
import { concatHex, encodeAbiParameters, getCreate2Address, keccak256 } from "viem";

import { defineAction, defineExtendedAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { provideConfig } from "../../../internal/config/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { executeSequential } from "../../../internal/write/execute-sequential.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { createResolverIntent } from "./prepare.js";
import type {
  CreateResolverError,
  CreateResolverParameters,
  CreateResolverResult,
} from "./types.js";

export const predictResolverAddressEffect = Effect.fn("ensforge.predictResolverAddress")(function* (
  config: EnsforgeConfig,
  parameters: CreateResolverParameters,
) {
  const deployment = config.deployments;

  if (deployment.protocol !== "v2") {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "Permissioned Resolver prediction requires an ENSv2 deployment",
      cause: deployment,
    });
  }

  const wallet = yield* provideConfig(
    config,
    resolveWalletContext({
      ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
      ...(parameters.account === undefined ? {} : { account: parameters.account }),
    }),
  );

  const sender = typeof wallet.account === "string" ? wallet.account : wallet.account.address;
  const factory = deployment.v2.contracts.verifiableFactory;

  const proxyLogic = yield* provideConfig(
    config,
    Effect.gen(function* () {
      const ethereum = yield* EthereumClient;

      return yield* ethereum.readContractDirect({
        address: factory,
        abi: verifiableFactoryV2ProxyLogicAbi,
        functionName: "proxyLogic",
      });
    }),
  );

  return yield* Effect.try({
    try: () => {
      const salt = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [sender, parameters.salt]),
      );

      const bytecode = concatHex([
        "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
        proxyLogic,
        "0x5af43d82803e903d91602b57fd5bf3",
        salt,
      ]);

      return getCreate2Address({ from: factory, salt, bytecode });
    },
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to derive the Permissioned Resolver proxy address",
        cause,
      }),
  });
});

export const predictResolverAddress = defineAction<
  CreateResolverParameters,
  typeof EthereumAddress.Type,
  CreateResolverError
>(predictResolverAddressEffect);

const implementation = Effect.fn("ensforge.createResolver")(function* (
  config: EnsforgeConfig,
  parameters: CreateResolverParameters,
) {
  const resolver = yield* predictResolverAddressEffect(config, parameters);

  const result = yield* executeSequential(config, {
    calls: [createResolverIntent(parameters)],
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
  });

  const call = result.calls[0];

  if (call === undefined) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "createResolver did not produce an execution result",
      cause: result,
    });
  }

  const deployment = config.deployments;

  if (deployment.protocol !== "v2") {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "Permissioned Resolver creation requires an ENSv2 deployment",
      cause: deployment,
    });
  }

  return {
    status: "deployed",
    resolver,
    implementation: deployment.v2.implementations.permissionedResolver,
    factory: deployment.v2.contracts.verifiableFactory,
    call,
  } satisfies CreateResolverResult;
});

const action = defineExtendedAction<
  CreateResolverParameters,
  CreateResolverResult,
  CreateResolverError
>(implementation);

export const createResolver = Object.freeze(
  Object.defineProperty(action, "call", {
    value: createResolverIntent,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as typeof action & { readonly call: typeof createResolverIntent };

export { prepareCreateResolver } from "./prepare.js";
export type {
  CreateResolverError,
  CreateResolverIntent,
  CreateResolverParameters,
  CreateResolverResult,
} from "./types.js";
