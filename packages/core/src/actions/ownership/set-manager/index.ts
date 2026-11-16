import { Effect } from "effect";

import { ensRegistryV1SetOwnerAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { getWriteTarget } from "../../capabilities/get-write-target/index.js";
import { decodeOwnershipAddress } from "../address.js";
import { requireOwnershipAuthorization } from "../authorization.js";
import type { SetManagerParameters } from "../types.js";

const prepare: EnsWriteIntentPreparer<SetManagerParameters, WriteError> = Effect.fn(
  "ensforge.setManager.prepare",
)(function* (config, parameters, context) {
  const name = yield* normalizeName.effect(parameters.name);
  const manager = yield* decodeOwnershipAddress(parameters.manager, "manager");
  const target = yield* getWriteTarget.effect(config, { name, operation: { type: "setOwner" } });

  if (!target.available || target.protocol !== "v1" || target.kind !== "registry") {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `Registry-level manager ownership is unavailable for ${name}; use transferName`,
    });
  }

  yield* requireOwnershipAuthorization(config, name, context.account, { type: "setOwner" });

  const data = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: ensRegistryV1SetOwnerAbi,
        functionName: "setOwner",
        args: [namehash(name), manager],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the manager update for ${name}`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol: "v1" as const };
});

export const setManager = makeSingleWriteAction("setManager", prepare);

export type {
  OwnershipWriteError as SetManagerError,
  OwnershipWriteResult as SetManagerResult,
  SetManagerParameters,
} from "../types.js";
