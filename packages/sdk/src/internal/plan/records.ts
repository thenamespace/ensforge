import { Effect } from "effect";

import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import { PlanError } from "../../errors/classes/PlanError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { fromPromise } from "../rpc/fromPromise.js";

/** The saved record of plan `id`. */
export const requireRecord = (client: Client, id: string): Effect.Effect<Plan.Record, AnyError> =>
  fromPromise(() => client.config.storage.get(id)).pipe(
    Effect.flatMap((record) =>
      record === undefined
        ? Effect.fail(
            new NotFoundError({
              code: "PLAN_NOT_FOUND",
              hint: "Plans are saved in the client's `storage`; memory storage forgets them on reload.",
            }),
          )
        : Effect.succeed(record),
    ),
  );

/** Fails unless `plan` was prepared for this client's chain and, when it names one, `account`. */
export const requireSendable = (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.Effect<Plan, AnyError> => {
  if (plan.chainId !== client.chain.id) {
    return Effect.fail(new PlanError({ code: "PLAN_CHAIN_MISMATCH" }));
  }
  if (
    plan.account !== undefined &&
    account !== undefined &&
    !isAddressEqual(plan.account, account)
  ) {
    return Effect.fail(new PlanError({ code: "PLAN_ACCOUNT_MISMATCH" }));
  }
  return Effect.succeed(plan);
};
