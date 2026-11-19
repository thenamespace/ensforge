import { Effect } from "effect";

import { maxUint256 } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as Role from "../../utils/Role.js";
import { tryAny } from "../anyError.js";

/** A roles option as a bitmap: role names, or a bitmap that fits the contracts' `uint256`. */
export const roleBitmapOf = (
  roles: readonly Role.Name[] | bigint,
): Effect.Effect<bigint, AnyError> => {
  if (typeof roles !== "bigint") {
    return tryAny(() => Role.from(roles));
  }
  return roles >= 0n && roles <= maxUint256
    ? Effect.succeed(roles)
    : Effect.fail(new InvalidInputError({ code: "INVALID_ROLES", input: roles }));
};
