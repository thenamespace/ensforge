import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { resolveRoleTarget } from "../../../internal/role/target.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { revoke as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.role.revoke`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const account = yield* requireAddress(options.holder, "holder");
  const roles = yield* roleBitmapOf(options.roles, options.target);
  const target = yield* resolveRoleTarget(client, options);
  // Registry and resolver share the EAC functions; the registry ABI covers both.
  const abi = Abis.v2.permissionedRegistry;
  const data =
    target.anyId === undefined
      ? encodeFunctionData({ abi, functionName: "revokeRootRoles", args: [roles, account] })
      : encodeFunctionData({
          abi,
          functionName: "revokeRoles",
          args: [target.anyId, roles, account],
        });

  const built = singleStepPlan(client, {
    operation: "role.revoke",
    account: options.account,
    description: "Revoke roles",
    calls: [{ to: target.contract, data, value: 0n }],
  });
  // Changing these roles on a name gives its token a new ID (contracts-v2 v1.0.1).
  return options.target === "registry" &&
    target.anyId !== undefined &&
    (roles & Roles.registryBitmaps.regeneration) !== 0n
    ? {
        ...built,
        warnings: [
          {
            code: "TOKEN_ID_REGENERATED",
            message: "These roles regenerate the name's token ID; re-read it afterwards.",
          },
        ],
      }
    : built;
});

const write = Action.write("role.revoke", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.role.revoke`. */
export const revoke = write.send;

/** @internal Implementation of `Actions.role.revokeSync`. */
export const revokeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.role.revoke`. */
export const revokeMethods = write.methods;
