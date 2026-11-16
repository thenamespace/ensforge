import { Effect } from "effect";

import type { Account, Address } from "viem";

import type { EnsforgeConfig } from "../../config/config.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { getRequiredAuthorization } from "../capabilities/get-required-authorization/index.js";
import type { WriteOperation } from "../capabilities/types.js";

export const requireOwnershipAuthorization = Effect.fn("ensforge.requireOwnershipAuthorization")(
  function* (
    config: EnsforgeConfig,
    name: string,
    account: Account | Address,
    operation: WriteOperation,
  ) {
    const address = typeof account === "string" ? account : account.address;

    const authorization = yield* getRequiredAuthorization.effect(config, {
      name,
      account: address,
      operation,
    });

    if (authorization.authorization.status !== "authorized" || authorization.blockers.length > 0) {
      const reason =
        authorization.blockers.length > 0
          ? authorization.blockers.join(", ")
          : authorization.authorization.status === "unauthorized"
            ? authorization.authorization.requirement.kind
            : authorization.authorization.status === "unknown"
              ? authorization.authorization.reason
              : "blocked";

      return yield* new AuthorizationError({
        code: "UNAUTHORIZED",
        message: `Account ${address} cannot perform ${operation.type} for ${name}: ${reason}`,
      });
    }

    return authorization;
  },
);
