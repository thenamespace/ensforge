import { Effect } from "effect";

import { zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { requestedResolver, setResolverCall } from "../../../internal/name/set-resolver.js";
import { requireRegistered, singleStepPlan } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.resolver.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(client, loaded);
  const resolver =
    options.resolver === null
      ? zeroAddress
      : yield* requestedResolver(client, loaded, options.resolver);

  return singleStepPlan(client, {
    operation: "resolver.set",
    account: options.account,
    description: options.resolver === null ? "Remove resolver" : "Set resolver",
    calls: [yield* setResolverCall(client, loaded, resolver)],
  });
});

const write = Action.write(
  "resolver.set",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options) => options.name,
    () => ["setResolver" as const],
  ),
);

/** @internal Implementation of `Actions.resolver.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.resolver.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.resolver.set`. */
export const setMethods = write.methods;
