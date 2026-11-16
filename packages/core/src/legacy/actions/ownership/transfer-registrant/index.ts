import { Effect } from "effect";

import { baseRegistrarV1SafeTransferFromAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { decodeTransferRecipient } from "../address.js";
import { requireOwnershipAuthorization } from "../authorization.js";
import { getRegistrarTarget } from "../registrar-target.js";
import type { TransferRegistrantParameters } from "../types.js";

const prepare: EnsWriteIntentPreparer<TransferRegistrantParameters, WriteError> = Effect.fn(
  "ensforge.transferRegistrant.prepare",
)(function* (config, parameters, context) {
  const name = yield* normalizeName.effect(parameters.name);
  const to = yield* decodeTransferRecipient(parameters.to);
  const target = yield* getRegistrarTarget(config, name);

  yield* requireOwnershipAuthorization(config, name, context.account, { type: "transfer" });

  const data = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: baseRegistrarV1SafeTransferFromAbi,
        functionName: "safeTransferFrom",
        args: [target.registrant, to, target.tokenId],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the registrant transfer for ${name}`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol: "v1" as const };
});

export const transferRegistrant = makeSingleWriteAction("transferRegistrant", prepare);

export type {
  OwnershipWriteError as TransferRegistrantError,
  OwnershipWriteResult as TransferRegistrantResult,
  TransferRegistrantParameters,
} from "../types.js";
