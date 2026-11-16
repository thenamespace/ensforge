import { Effect } from "effect";

import { ensRegistryV1SetTTLAbi, nameWrapperV1SetTTLAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { getWriteTarget } from "../../capabilities/get-write-target/index.js";
import { requireOwnershipAuthorization } from "../authorization.js";
import type { SetTtlParameters } from "../types.js";

const prepare: EnsWriteIntentPreparer<SetTtlParameters, WriteError> = Effect.fn(
  "ensforge.setTtl.prepare",
)(function* (config, parameters, context) {
  const name = yield* normalizeName.effect(parameters.name);
  const target = yield* getWriteTarget.effect(config, { name, operation: { type: "setTtl" } });

  if (!target.available || target.protocol !== "v1") {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `TTL is unavailable for ${name}`,
    });
  }

  yield* requireOwnershipAuthorization(config, name, context.account, { type: "setTtl" });

  const wrapped = target.kind === "name-wrapper";

  const data = yield* Effect.try({
    try: () =>
      wrapped
        ? encodeFunctionData({
            abi: nameWrapperV1SetTTLAbi,
            functionName: "setTTL",
            args: [namehash(name), parameters.ttl],
          })
        : encodeFunctionData({
            abi: ensRegistryV1SetTTLAbi,
            functionName: "setTTL",
            args: [namehash(name), parameters.ttl],
          }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the TTL update for ${name}`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol: "v1" as const };
});

export const setTtl = makeSingleWriteAction("setTtl", prepare);

export type {
  OwnershipWriteError as SetTtlError,
  OwnershipWriteResult as SetTtlResult,
  SetTtlParameters,
} from "../types.js";
