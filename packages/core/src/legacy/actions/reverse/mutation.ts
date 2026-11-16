import { Effect } from "effect";

import {
  reverseRegistrarV1DefaultResolverAbi,
  reverseRegistrarV1SetNameAbi,
  reverseRegistrarV1SetNameForAddrAbi,
  defaultReverseRegistrarAdapterV2SetNameAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { EnsWriteIntentPreparer } from "../../action/write-intent.js";
import { ContractError } from "../../errors/contract-error.js";
import { ReverseNameError } from "../../errors/reverse-name-error.js";
import { viemErrorToEffectError } from "../../internal/errors/viem-error.js";
import { makeSingleWriteAction } from "../../internal/write/single-write-action.js";
import { normalizeName } from "../../names/normalize.js";
import type { WriteError } from "../../write/types.js";
import { decodeOwnershipAddress } from "../ownership/address.js";
import { getAddress } from "../records/get-address/index.js";
import { requireContract, requireReverseAuthorization } from "./authorization.js";

interface ReverseMutationParameters {
  readonly target?: string;
  readonly name: string;
  readonly verifyForward?: boolean;
  readonly targetKind?: "contract";
}

const encode = (operation: string, target: Address, makeData: () => `0x${string}`) =>
  Effect.try({
    try: makeData,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation} for ${target}`,
        cause,
      }),
  });

const prepare: EnsWriteIntentPreparer<ReverseMutationParameters, WriteError> = Effect.fn(
  "ensforge.reverse.prepare",
)(function* (config, parameters, context) {
  const caller = yield* decodeOwnershipAddress(
    typeof context.account === "string" ? context.account : context.account.address,
    "wallet account",
  );

  const target =
    parameters.target === undefined
      ? caller
      : yield* decodeOwnershipAddress(parameters.target, "reverse target");

  const name = parameters.name.length === 0 ? "" : yield* normalizeName.effect(parameters.name);

  if (parameters.targetKind === "contract" && !(yield* requireContract(config, target))) {
    return yield* new ReverseNameError({
      code: "TARGET_NOT_CONTRACT",
      message: `${target} is not a deployed contract`,
    });
  }

  yield* requireReverseAuthorization(config, target, caller);

  if (name.length > 0 && parameters.verifyForward !== false) {
    const forward = yield* getAddress.effect(config, { name });

    const forwardAddress =
      forward.address === null
        ? null
        : yield* decodeOwnershipAddress(forward.address, "forward record");

    if (forwardAddress === null || !isAddressEqual(forwardAddress, target)) {
      return yield* new ReverseNameError({
        code: "FORWARD_ADDRESS_MISMATCH",
        message: `${name} does not resolve to ${target}`,
      });
    }
  }

  if (config.deployments.protocol === "v2") {
    return {
      to: config.deployments.v2.contracts.defaultReverseRegistrarAdapter,
      data: yield* encode("the ENSv2 primary-name update", target, () =>
        encodeFunctionData({
          abi: defaultReverseRegistrarAdapterV2SetNameAbi,
          functionName: "setName",
          args: [target, name],
        }),
      ),
      value: 0n,
      protocol: "v2" as const,
    };
  }

  const registrar = config.deployments.v1.contracts.reverseRegistrar;

  if (isAddressEqual(target, caller)) {
    return {
      to: registrar,
      data: yield* encode("the ENSv1 primary-name update", target, () =>
        encodeFunctionData({
          abi: reverseRegistrarV1SetNameAbi,
          functionName: "setName",
          args: [name],
        }),
      ),
      value: 0n,
      protocol: "v1" as const,
    };
  }

  const defaultResolver = yield* Effect.tryPromise({
    try: () =>
      config.publicClient.readContract({
        address: registrar,
        abi: reverseRegistrarV1DefaultResolverAbi,
        functionName: "defaultResolver",
      }),
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });

  return {
    to: registrar,
    data: yield* encode("the delegated ENSv1 primary-name update", target, () =>
      encodeFunctionData({
        abi: reverseRegistrarV1SetNameForAddrAbi,
        functionName: "setNameForAddr",
        args: [target, target, defaultResolver, name],
      }),
    ),
    value: 0n,
    protocol: "v1" as const,
  };
});

export const makeReverseNameAction = <Parameters>(
  operation: string,
  toMutation: (parameters: Parameters) => ReverseMutationParameters,
) =>
  makeSingleWriteAction<Parameters>(operation, (config, parameters, context) =>
    prepare(config, toMutation(parameters), context),
  );
