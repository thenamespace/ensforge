import { Effect, Schema } from "effect";

import {
  permissionedResolverInitializableV2InterfaceInitializeAbi,
  verifiableFactoryV2DeployProxyAbi,
} from "@ensforge/contracts/internal";
import { enhancedAccessControlRoles } from "@ensforge/contracts/v2";
import { encodeFunctionData } from "viem";

import { makeWriteIntent, type EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";
import type { CreateResolverParameters } from "./types.js";

export const prepareCreateResolver: EnsWriteIntentPreparer<CreateResolverParameters, WriteError> =
  Effect.fn("ensforge.createResolver.prepare")(function* (config, parameters, context) {
    const profile = config.deployments;

    if (profile.protocol !== "v2") {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "Permissioned Resolver creation requires an ENSv2 deployment",
        cause: profile,
      });
    }

    const account = typeof context.account === "string" ? context.account : context.account.address;

    const admin = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(EthereumAddress)(parameters.admin ?? account),
      catch: () =>
        new CodecError({
          code: "INVALID_ADDRESS",
          message: "Invalid Permissioned Resolver administrator address",
        }),
    });

    const setters = parameters.setters ?? [];

    if (setters.some((setter) => !Schema.is(Hex)(setter))) {
      return yield* new CodecError({
        code: "INVALID_HEX",
        message: "Invalid Permissioned Resolver initialization setter",
      });
    }

    const data = yield* Effect.try({
      try: () => {
        const roles = parameters.roles ?? enhancedAccessControlRoles.allRoles;

        const initialization = encodeFunctionData({
          abi: permissionedResolverInitializableV2InterfaceInitializeAbi,
          functionName: "initialize",
          args: [parameters.grants ?? [{ account: admin, roleBitmap: roles }], setters],
        });

        return encodeFunctionData({
          abi: verifiableFactoryV2DeployProxyAbi,
          functionName: "deployProxy",
          args: [profile.v2.implementations.permissionedResolver, parameters.salt, initialization],
        });
      },
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: "Unable to encode the Permissioned Resolver deployment",
          cause,
        }),
    });

    return {
      to: profile.v2.contracts.verifiableFactory,
      data,
      value: 0n,
      protocol: "v2",
    };
  });

export const createResolverIntent = (parameters: CreateResolverParameters) =>
  makeWriteIntent<CreateResolverParameters, CallExecutionResult, WriteError>(
    "createResolver",
    parameters,
    prepareCreateResolver,
  );
