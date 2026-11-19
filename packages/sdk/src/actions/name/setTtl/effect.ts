import { Effect } from "effect";

import { maxUint64 } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import * as V1Calls from "../../../internal/name/v1-calls.js";
import {
  l2WriteTargetOf,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setTtl as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.name.setTtl`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  if (options.ttl < 0n || options.ttl > maxUint64) {
    return yield* Effect.fail(
      new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "ttl", input: options.ttl }),
    );
  }

  const loaded = yield* loadName(client, options.name);
  // A Basenames or Linea name keeps its TTL on its L2.
  const l2 = yield* l2WriteTargetOf(client, loaded);
  if (l2 !== null) {
    const { forkTarget } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    const fork = yield* forkTarget(l2, loaded.data.parts);
    return singleStepPlan(l2.client, {
      operation: "name.setTtl",
      account: options.account,
      description: "Set TTL",
      calls: [V1Calls.setTtl(fork.to, loaded.data.parts.node, options.ttl)],
    });
  }
  yield* requireRegistered(client, loaded);
  yield* requireProtocol(loaded, "v1", "TTL");

  const contracts = yield* requireV1Contracts(client);
  const call = V1Calls.setTtl(
    loaded.state.wrapped ? contracts.nameWrapper : contracts.registry,
    loaded.data.parts.node,
    options.ttl,
  );

  return singleStepPlan(client, {
    operation: "name.setTtl",
    account: options.account,
    description: "Set TTL",
    calls: [call],
  });
});

const write = Action.write(
  "name.setTtl",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options) => options.name,
    () => ["setTtl" as const],
  ),
);

/** @internal Implementation of `Actions.name.setTtl`. */
export const setTtl = write.send;

/** @internal Implementation of `Actions.name.setTtlSync`. */
export const setTtlSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.name.setTtl`. */
export const setTtlMethods = write.methods;
