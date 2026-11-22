import { Effect } from "effect";

import { maxUint256 } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as Role from "../../utils/Role.js";
import { tryAny } from "../anyError.js";

/**
 * A roles option as a bitmap: role names of `target`'s table, or a bitmap that fits the
 * contracts' `uint256`. Registry and resolver roles share bit positions, so a name is only read
 * from the table of the contract it is for.
 */
export const roleBitmapOf = (
  roles: readonly Role.Name[] | bigint,
  target: Role.Target,
): Effect.Effect<bigint, AnyError> => {
  if (typeof roles !== "bigint") {
    return tryAny(() => Role.from(roles, target));
  }
  return roles >= 0n && roles <= maxUint256
    ? Effect.succeed(roles)
    : Effect.fail(new InvalidInputError({ code: "INVALID_ROLES", input: roles }));
};
