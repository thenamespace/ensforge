import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { resolveRoleTarget, type ResolvedRoleTarget } from "../../../internal/role/target.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Role from "../../../utils/Role.js";
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

  // The registry checks `canTransferAdmin` on the owner's token before every transfer, and admin
  // roles can never be granted on a token again: revoking it freezes the name until it expires.
  if (
    options.target === "registry" &&
    target.owner !== undefined &&
    isAddressEqual(target.owner, account) &&
    (roles & Roles.registry.canTransferAdmin) !== 0n &&
    options.allowIrreversible !== true
  ) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_ROLES",
        field: "roles",
        input: "canTransferAdmin",
        shortMessage:
          "Revoking canTransferAdmin from the name's owner freezes the name until it expires.",
        hint: "Pass `allowIrreversible: true` to revoke it anyway.",
      }),
    );
  }
  const lockout = yield* lastAdminRoles(client, target, account, roles);

  const built = singleStepPlan(client, {
    operation: "role.revoke",
    account: options.account,
    description: "Revoke roles",
    calls: [{ to: target.contract, data, value: 0n }],
  });
  // Changing these roles on a name gives its token a new ID (contracts-v2 v1.0.1).
  const regenerates =
    options.target === "registry" &&
    target.anyId !== undefined &&
    (roles & Roles.registryBitmaps.regeneration) !== 0n;
  return {
    ...built,
    warnings: [
      ...(regenerates
        ? [
            {
              code: "TOKEN_ID_REGENERATED",
              message: "These roles regenerate the name's token ID; re-read it afterwards.",
            },
          ]
        : []),
      ...(lockout === 0n
        ? []
        : [
            {
              code: "ROLE_ADMIN_LOCKOUT",
              message: `${account} is the last account that can grant ${Arr.join(Role.toNames(lockout, options.target), ", ")} here, and no root holder can restore them.`,
            },
          ]),
    ],
  };
});

/**
 * The admin roles in `roles` that `holder` is the last holder of on the target, with no holder at
 * the root either (for a name), so nobody could grant them again.
 */
const lastAdminRoles = Effect.fnUntraced(function* (
  client: Client,
  target: ResolvedRoleTarget,
  holder: Address,
  roles: bigint,
): Effect.fn.Return<bigint, AnyError> {
  const abi = Abis.v2.permissionedRegistry;
  const held = yield* Rpc.readContract(client, {
    address: target.contract,
    abi,
    functionName: "roles",
    args: [target.resource, holder],
  });
  const admins = roles & held & Roles.enhancedAccessControl.adminRoles;
  if (admins === 0n) return 0n;

  const count = (resource: bigint) =>
    Effect.map(
      Rpc.readContract(client, {
        address: target.contract,
        abi,
        functionName: "getAssigneeCount",
        args: [resource, admins],
      }),
      ([counts]) => counts,
    );
  const [here, root] = yield* Effect.all(
    [count(target.resource), target.resource === 0n ? Effect.succeed(0n) : count(0n)],
    { concurrency: "unbounded" },
  );
  // Counts are one nybble per role, at the role's own bit.
  return Arr.reduce(Arr.range(0, 63), 0n, (last, index) => {
    const bit = 1n << BigInt(index * 4);
    const nybble = (counts: bigint) => (counts >> BigInt(index * 4)) & 0xfn;
    return (admins & bit) !== 0n && nybble(here) === 1n && nybble(root) === 0n ? last | bit : last;
  });
});

const write = Action.write("role.revoke", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.role.revoke`. */
export const revoke = write.send;

/** @internal Implementation of `Actions.role.revokeSync`. */
export const revokeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.role.revoke`. */
export const revokeMethods = write.methods;
