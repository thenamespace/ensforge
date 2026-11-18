import { Effect, Predicate } from "effect";

import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import { PlanError } from "../../errors/classes/PlanError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { hasChain } from "../write/chain.js";

/** The saved record of plan `id`. */
export const requireRecord = (client: Client, id: string): Effect.Effect<Plan.Record, AnyError> =>
  fromPromise(() => client.config.storage.get(id)).pipe(
    Effect.filterOrFail(
      Predicate.isNotUndefined,
      () =>
        new NotFoundError({
          code: "PLAN_NOT_FOUND",
          hint: "Plans are saved in the client's `storage`; memory storage forgets them on reload.",
        }),
    ),
  );

/**
 * Fails unless `plan` was prepared for this client's chain or one of its `chains` and, when it
 * names one, for `account`.
 */
export const requireSendable = (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.Effect<Plan, AnyError> => {
  if (!hasChain(client, plan.chainId)) {
    return Effect.fail(
      new PlanError({
        code: "PLAN_CHAIN_MISMATCH",
        context: { chainId: plan.chainId },
        hint: `Send it with a client on chain ${plan.chainId}, or add that chain to \`chains\` in Ensforge.create.`,
      }),
    );
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
