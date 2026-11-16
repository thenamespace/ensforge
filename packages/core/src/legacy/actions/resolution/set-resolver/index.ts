import { Effect, Schema } from "effect";

import {
  ensRegistryV1SetResolverAbi,
  nameWrapperV1SetResolverAbi,
  standardRegistryV2SetResolverAbi,
  wrapperRegistryV2SetResolverAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import {
  defineWriteAction,
  makeWriteIntent,
  type EnsWriteIntentPreparer,
} from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { executeSequential } from "../../../internal/write/execute-sequential.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";
import { getRequiredAuthorization } from "../../capabilities/get-required-authorization/index.js";
import type { SetResolverParameters } from "./types.js";

const preparer: EnsWriteIntentPreparer<SetResolverParameters, WriteError> = Effect.fn(
  "ensforge.setResolver.prepare",
)(function* (config, parameters, context) {
  const resolver = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(EthereumAddress)(parameters.resolver),
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: `Invalid resolver address for ${parameters.name}`,
      }),
  });

  const account = typeof context.account === "string" ? context.account : context.account.address;

  const authorization = yield* getRequiredAuthorization.effect(config, {
    name: parameters.name,
    account,
    operation: { type: "setResolver" },
  });

  if (!authorization.target.available) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `No resolver-management target is available for ${parameters.name}`,
    });
  }

  if (authorization.authorization.status !== "authorized") {
    return yield* new AuthorizationError({
      code: "UNAUTHORIZED",
      message: `${account} is not authorized to set the resolver for ${parameters.name}`,
    });
  }

  const target = authorization.target;

  const data = yield* Effect.try({
    try: () => {
      if (target.kind === "name-wrapper") {
        return encodeFunctionData({
          abi: nameWrapperV1SetResolverAbi,
          functionName: "setResolver",
          args: [target.node, resolver],
        });
      }

      if (target.kind === "registry" && target.protocol === "v1") {
        return encodeFunctionData({
          abi: ensRegistryV1SetResolverAbi,
          functionName: "setResolver",
          args: [target.node, resolver],
        });
      }

      if (target.tokenId === null) throw new Error("Missing ENSv2 resolver token ID");

      return encodeFunctionData({
        abi:
          target.kind === "wrapper-registry"
            ? wrapperRegistryV2SetResolverAbi
            : standardRegistryV2SetResolverAbi,
        functionName: "setResolver",
        args: [target.tokenId, resolver],
      });
    },
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the setResolver call for ${parameters.name}`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol: target.protocol };
});

const implementation = Effect.fn("ensforge.setResolver")(function* (
  config: EnsforgeConfig,
  parameters: SetResolverParameters,
) {
  const intent = makeWriteIntent<SetResolverParameters, CallExecutionResult, WriteError>(
    "setResolver",
    parameters,
    preparer,
  );

  const result = yield* executeSequential(config, { calls: [intent] });
  const call = result.calls[0];

  if (call === undefined) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "setResolver did not produce an execution result",
      cause: result,
    });
  }

  return call;
});

export const setResolver = defineWriteAction("setResolver", implementation, preparer);

export type { SetResolverError, SetResolverParameters, SetResolverResult } from "./types.js";
