import { Effect, Schema } from "effect";

import {
  permissionedResolverV2CanUpgradeFromAbi,
  permissionedResolverV2InterfaceHasRootRolesAbi,
  permissionedResolverV2UpgradeToAndCallAbi,
  verifiableFactoryV2VerifyContractAbi,
} from "@ensforge/contracts/internal";
import { resolverRoles } from "@ensforge/contracts/v2";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import { defineExtendedAction } from "../../../action/action.js";
import { makeWriteIntent, type EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { executeSequential } from "../../../internal/write/execute-sequential.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";
import { getResolverCapabilities } from "../../capabilities/get-resolver-capabilities/index.js";
import type {
  UpgradeResolverError,
  UpgradeResolverParameters,
  UpgradeResolverResult,
} from "./types.js";

interface ResolverUpgradeState {
  readonly resolver: typeof EthereumAddress.Type;
  readonly currentImplementation: typeof EthereumAddress.Type;
  readonly implementation: typeof EthereumAddress.Type;
  readonly data: typeof Hex.Type;
  readonly current: boolean;
}

const readUpgradeState = Effect.fn("ensforge.upgradeResolver.state")(function* (
  config: EnsforgeConfig,
  parameters: UpgradeResolverParameters,
  account: Address,
): Effect.fn.Return<ResolverUpgradeState, WriteError> {
  const implementation = yield* Effect.try({
    try: () => {
      if (config.deployments.protocol !== "v2") throw new Error("ENSv2 unavailable");

      return Schema.decodeUnknownSync(EthereumAddress)(
        parameters.implementation ?? config.deployments.v2.implementations.permissionedResolver,
      );
    },
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: "Invalid Permissioned Resolver upgrade implementation",
      }),
  });

  const data = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(Hex)(parameters.data ?? "0x"),
    catch: () =>
      new CodecError({
        code: "INVALID_HEX",
        message: "Invalid Permissioned Resolver upgrade data",
      }),
  });

  return yield* executeRead(
    config,
    { consistency: "snapshot" },
    Effect.gen(function* () {
      if (config.deployments.protocol !== "v2") {
        return yield* new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: "Permissioned Resolver upgrades require ENSv2",
        });
      }

      const capabilities = yield* getResolverCapabilities.effect(config, {
        name: parameters.name,
      });

      if (capabilities.address === null || !capabilities.permissioned || capabilities.inherited) {
        return yield* new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `No directly attached Permissioned Resolver is available for ${parameters.name}`,
        });
      }

      const ethereum = yield* EthereumClient;

      const currentImplementation = yield* ethereum.readContract({
        address: config.deployments.v2.contracts.verifiableFactory,
        abi: verifiableFactoryV2VerifyContractAbi,
        functionName: "verifyContract",
        args: [capabilities.address],
      });

      const compatible = yield* ethereum.readContract({
        address: implementation,
        abi: permissionedResolverV2CanUpgradeFromAbi,
        functionName: "canUpgradeFrom",
        args: [currentImplementation],
      });

      if (!compatible) {
        return yield* new AuthorizationError({
          code: "RECORD_UNSUPPORTED",
          message: `${implementation} is not a compatible Permissioned Resolver upgrade`,
        });
      }

      const current = isAddressEqual(currentImplementation, implementation);

      if (!current || parameters.force === true) {
        const authorized = yield* ethereum.readContract({
          address: capabilities.address,
          abi: permissionedResolverV2InterfaceHasRootRolesAbi,
          functionName: "hasRootRoles",
          args: [resolverRoles.upgrade, account],
        });

        if (!authorized) {
          return yield* new AuthorizationError({
            code: "UNAUTHORIZED",
            message: `${account} cannot upgrade the resolver for ${parameters.name}`,
          });
        }
      }

      return {
        resolver: capabilities.address,
        currentImplementation,
        implementation,
        data,
        current,
      };
    }),
  );
});

const preparer: EnsWriteIntentPreparer<UpgradeResolverParameters, WriteError> = Effect.fn(
  "ensforge.upgradeResolver.prepare",
)(function* (config, parameters, context) {
  const account = typeof context.account === "string" ? context.account : context.account.address;
  const state = yield* readUpgradeState(config, parameters, account);

  if (state.current && parameters.force !== true) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: `The resolver for ${parameters.name} already uses the requested implementation`,
      cause: state,
    });
  }

  const data = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: permissionedResolverV2UpgradeToAndCallAbi,
        functionName: "upgradeToAndCall",
        args: [state.implementation, state.data],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the resolver upgrade for ${parameters.name}`,
        cause,
      }),
  });

  return { to: state.resolver, data, value: 0n, protocol: "v2" };
});

const makeIntent = (parameters: UpgradeResolverParameters) =>
  makeWriteIntent<UpgradeResolverParameters, CallExecutionResult, WriteError>(
    "upgradeResolver",
    parameters,
    preparer,
  );

const implementation = Effect.fn("ensforge.upgradeResolver")(function* (
  config: EnsforgeConfig,
  parameters: UpgradeResolverParameters,
) {
  const wallet = yield* executeRead(config, {}, resolveWalletContext(parameters));
  const account = typeof wallet.account === "string" ? wallet.account : wallet.account.address;
  const state = yield* readUpgradeState(config, parameters, account);

  if (state.current && parameters.force !== true) {
    return {
      status: "current",
      resolver: state.resolver,
      implementation: state.currentImplementation,
      call: null,
    } as const satisfies UpgradeResolverResult;
  }

  const result = yield* executeSequential(config, {
    calls: [makeIntent(parameters)],
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
  });

  const call = result.calls[0];

  if (call === undefined) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "upgradeResolver did not produce an execution result",
      cause: result,
    });
  }

  return {
    status: "upgraded",
    resolver: state.resolver,
    previousImplementation: state.currentImplementation,
    implementation: state.implementation,
    call,
  } as const satisfies UpgradeResolverResult;
});

const action = defineExtendedAction<
  UpgradeResolverParameters,
  UpgradeResolverResult,
  UpgradeResolverError
>(implementation);

export const upgradeResolver = Object.freeze(
  Object.defineProperty(action, "call", {
    value: makeIntent,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as typeof action & { readonly call: typeof makeIntent };

export type {
  UpgradeResolverError,
  UpgradeResolverIntent,
  UpgradeResolverParameters,
  UpgradeResolverResult,
} from "./types.js";
