import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { requireTargetRegistry } from "../../../internal/registry/target.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setUri as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.registry.setUri`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const registry = yield* requireTargetRegistry(client, options);
  // Keep the current renderer unless another is given.
  const renderer =
    options.renderer === undefined
      ? ((yield* Rpc.readContractOrUndefined(client, {
          address: registry,
          abi: Abis.v2.userRegistry,
          functionName: "getURI",
        }))?.[1] ?? zeroAddress)
      : options.renderer === null
        ? zeroAddress
        : yield* requireAddress(options.renderer, "renderer");

  return singleStepPlan(client, {
    operation: "registry.setUri",
    account: options.account,
    description: "Set registry URI",
    calls: [
      {
        to: registry,
        data: encodeFunctionData({
          abi: Abis.v2.userRegistry,
          functionName: "setURI",
          args: [options.uri, renderer],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("registry.setUri", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.registry.setUri`. */
export const setUri = write.send;

/** @internal Implementation of `Actions.registry.setUriSync`. */
export const setUriSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registry.setUri`. */
export const setUriMethods = write.methods;
