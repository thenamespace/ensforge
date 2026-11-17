import { Effect } from "effect";

import { hexToBigInt, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { attachCalls } from "../../../internal/registry/deploy.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { attach as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.registry.attach`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v2", "subregistries");
  const registry =
    options.registry === null ? zeroAddress : yield* requireAddress(options.registry, "registry");

  return singleStepPlan(client, {
    operation: "registry.attach",
    account: options.account,
    description: options.registry === null ? "Detach registry" : "Attach registry",
    calls: attachCalls({
      parentRegistry: loaded.state.registry as Address,
      tokenId: loaded.state.tokenId ?? hexToBigInt(loaded.data.parts.labelhash),
      label: loaded.data.parts.label,
      registry,
      detach: options.registry === null || options.setParent === false,
    }),
  });
});

const write = Action.write("registry.attach", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.registry.attach`. */
export const attach = write.send;

/** @internal Implementation of `Actions.registry.attachSync`. */
export const attachSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registry.attach`. */
export const attachMethods = write.methods;
