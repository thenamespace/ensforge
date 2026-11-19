import { Effect } from "effect";

import { zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { requestedResolver, setResolverCall } from "../../../internal/name/set-resolver.js";
import * as V1Calls from "../../../internal/name/v1-calls.js";
import {
  l2WriteTargetOf,
  requireRegistered,
  singleStepPlan,
} from "../../../internal/name/write.js";
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
  // A Basenames or Linea name is pointed at its resolver on its L2.
  const l2 = yield* l2WriteTargetOf(client, loaded);
  if (l2 !== null) {
    const { forkTarget, forkResolver } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    const { parts } = loaded.data;
    const fork = yield* forkTarget(l2, parts);
    const resolver = yield* forkResolver(l2.location, fork.contracts, options.resolver);
    return singleStepPlan(l2.client, {
      operation: "resolver.set",
      account: options.account,
      description: options.resolver === null ? "Remove resolver" : "Set resolver",
      calls: [V1Calls.setResolver(fork.to, parts.node, resolver)],
    });
  }
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
