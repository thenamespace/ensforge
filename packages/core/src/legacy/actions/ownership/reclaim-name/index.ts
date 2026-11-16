import { Effect } from "effect";

import { baseRegistrarV1ReclaimAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { decodeOwnershipAddress } from "../address.js";
import { requireOwnershipAuthorization } from "../authorization.js";
import { getRegistrarTarget } from "../registrar-target.js";
import type { ReclaimNameParameters } from "../types.js";

const prepare: EnsWriteIntentPreparer<ReclaimNameParameters, WriteError> = Effect.fn(
  "ensforge.reclaimName.prepare",
)(function* (config, parameters, context) {
  const name = yield* normalizeName.effect(parameters.name);
  const manager = yield* decodeOwnershipAddress(parameters.manager, "manager");
  const target = yield* getRegistrarTarget(config, name);

  yield* requireOwnershipAuthorization(config, name, context.account, { type: "transfer" });

  const data = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: baseRegistrarV1ReclaimAbi,
        functionName: "reclaim",
        args: [target.tokenId, manager],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the reclaim for ${name}`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol: "v1" as const };
});

export const reclaimName = makeSingleWriteAction("reclaimName", prepare);

export type {
  OwnershipWriteError as ReclaimNameError,
  OwnershipWriteResult as ReclaimNameResult,
  ReclaimNameParameters,
} from "../types.js";
