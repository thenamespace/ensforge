import { Effect } from "effect";

import { baseRegistrarV1ApproveAbi, nameWrapperV1ApproveAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, zeroAddress } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import type { WriteError } from "../../../write/types.js";
import { getTokenApproval } from "../../capabilities/get-token-approval/index.js";
import { decodePermissionAddress } from "../address.js";
import type { ApproveNameParameters, ClearNameApprovalParameters } from "./types.js";

const prepare = Effect.fn("ensforge.approveName.prepareApproval")(function* (
  config,
  name: string,
  approved: string,
) {
  const target = yield* getTokenApproval.effect(config, { name });

  if (!target.supported) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `Per-name approval is unavailable for ${name}: ${target.reason}`,
    });
  }

  const address = yield* decodePermissionAddress(approved, "approved account");

  const data = yield* Effect.try({
    try: () =>
      target.kind === "registrar"
        ? encodeFunctionData({
            abi: baseRegistrarV1ApproveAbi,
            functionName: "approve",
            args: [address, target.tokenId],
          })
        : encodeFunctionData({
            abi: nameWrapperV1ApproveAbi,
            functionName: "approve",
            args: [address, target.tokenId],
          }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the name approval for ${name}`,
        cause,
      }),
  });

  return { to: target.contract, data, value: 0n, protocol: "v1" as const };
});

const approvePreparer: EnsWriteIntentPreparer<ApproveNameParameters, WriteError> = Effect.fn(
  "ensforge.approveName.prepare",
)(function* (config, parameters) {
  return yield* prepare(config, parameters.name, parameters.approved);
});

const clearPreparer: EnsWriteIntentPreparer<ClearNameApprovalParameters, WriteError> = Effect.fn(
  "ensforge.clearNameApproval.prepare",
)(function* (config, parameters) {
  return yield* prepare(config, parameters.name, zeroAddress);
});

export const approveName = makeSingleWriteAction("approveName", approvePreparer);

export const clearNameApproval = makeSingleWriteAction("clearNameApproval", clearPreparer);

export type {
  ApproveNameError,
  ApproveNameIntent,
  ApproveNameParameters,
  ApproveNameResult,
  ClearNameApprovalError,
  ClearNameApprovalIntent,
  ClearNameApprovalParameters,
  ClearNameApprovalResult,
} from "./types.js";
