import { Effect } from "effect";

import { publicResolverV1ApproveAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, isAddressEqual } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { getResolverCapabilities } from "../../capabilities/get-resolver-capabilities/index.js";
import { getManager } from "../../name/get-manager/index.js";
import { decodePermissionAddress } from "../address.js";
import type { SetResolverDelegateApprovalParameters } from "./types.js";

const preparer: EnsWriteIntentPreparer<SetResolverDelegateApprovalParameters, WriteError> =
  Effect.fn("ensforge.setResolverDelegateApproval.prepare")(
    function* (config, parameters, context) {
      const name = yield* normalizeName.effect(parameters.name);
      const delegate = yield* decodePermissionAddress(parameters.delegate, "resolver delegate");

      const account = yield* decodePermissionAddress(
        typeof context.account === "string" ? context.account : context.account.address,
        "owner",
      );

      const [capabilities, manager] = yield* Effect.all(
        [
          getResolverCapabilities.effect(config, { name }),
          getManager.effect(config, { name }),
        ] as const,
        { concurrency: "unbounded" },
      );

      if (
        capabilities.address === null ||
        capabilities.inherited ||
        capabilities.authorization !== "owner-delegate"
      ) {
        return yield* new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `A directly attached Public Resolver is required for ${name}`,
        });
      }

      if (manager === null || !isAddressEqual(manager, account)) {
        return yield* new AuthorizationError({
          code: "UNAUTHORIZED",
          message: `${account} cannot administer resolver delegates for ${name}`,
        });
      }

      const data = yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: publicResolverV1ApproveAbi,
            functionName: "approve",
            args: [namehash(name), delegate, parameters.approved],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode the resolver delegate approval for ${name}`,
            cause,
          }),
      });

      return { to: capabilities.address, data, value: 0n };
    },
  );

export const setResolverDelegateApproval = makeSingleWriteAction(
  "setResolverDelegateApproval",
  preparer,
);

export type {
  SetResolverDelegateApprovalError,
  SetResolverDelegateApprovalIntent,
  SetResolverDelegateApprovalParameters,
  SetResolverDelegateApprovalResult,
} from "./types.js";
