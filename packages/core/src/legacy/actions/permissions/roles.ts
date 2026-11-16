import { Effect } from "effect";

import { WritePlanError } from "../../errors/write-plan-error.js";

export const validateRoleBitmap = (roles: bigint) =>
  roles > 0n && roles < 1n << 256n
    ? Effect.succeed(roles)
    : Effect.fail(
        new WritePlanError({
          code: "INVALID_CALL_PLAN",
          message: "Role bitmap must be a non-zero uint256",
          cause: roles,
        }),
      );
