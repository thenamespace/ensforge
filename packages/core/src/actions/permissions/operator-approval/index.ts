import { Effect } from "effect";

import { ensRegistryV1SetApprovalForAllAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import type { WriteError } from "../../../write/types.js";
import { getOperatorApproval } from "../../capabilities/get-operator-approval/index.js";
import { getProtocol } from "../../name/get-protocol/index.js";
import { decodePermissionAddress } from "../address.js";
import type { SetOperatorApprovalParameters } from "./types.js";

const preparer: EnsWriteIntentPreparer<SetOperatorApprovalParameters, WriteError> = Effect.fn(
  "ensforge.setOperatorApproval.prepare",
)(function* (config, parameters, context) {
  const owner = yield* decodePermissionAddress(
    typeof context.account === "string" ? context.account : context.account.address,
    "owner",
  );

  const operator = yield* decodePermissionAddress(parameters.operator, "operator");

  const [approval, protocol] = yield* Effect.all(
    [
      getOperatorApproval.effect(config, { name: parameters.name, owner, operator }),
      getProtocol.effect(config, { name: parameters.name }),
    ] as const,
    { concurrency: "unbounded" },
  );

  const target = approval.targets.find((candidate) => candidate.kind === parameters.target);

  if (target === undefined || !target.supported) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${parameters.target} operator approvals are unavailable for ${parameters.name}`,
    });
  }

  const data = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: ensRegistryV1SetApprovalForAllAbi,
        functionName: "setApprovalForAll",
        args: [operator, parameters.approved],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the ${parameters.target} operator approval`,
        cause,
      }),
  });

  return { to: target.address, data, value: 0n, protocol };
});

export const setOperatorApproval = makeSingleWriteAction("setOperatorApproval", preparer);

export type {
  OperatorApprovalKind,
  SetOperatorApprovalError,
  SetOperatorApprovalIntent,
  SetOperatorApprovalParameters,
  SetOperatorApprovalResult,
} from "./types.js";
