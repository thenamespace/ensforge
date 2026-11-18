import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf, sameAddress } from "../../../internal/address.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setManager as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.name.setManager`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const manager = yield* requireAddress(options.manager, "manager");
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "managers");

  const { state, data } = loaded;
  const contracts = yield* requireV1Contracts(client);
  if (state.wrapped) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: "v1",
        feature: "managers of wrapped names",
      }),
    );
  }

  // The registrant can always reclaim; a manager who is not the registrant changes the registry owner.
  const account = addressOf(options.account) ?? client.account;
  const actsAsManager =
    account !== undefined &&
    sameAddress(state.manager, account) &&
    !sameAddress(state.registrant, account);

  const target =
    data.parts.isEth2ld && !actsAsManager
      ? {
          to: contracts.baseRegistrar,
          data: encodeFunctionData({
            abi: Abis.v1.baseRegistrar,
            functionName: "reclaim",
            args: [hexToBigInt(data.parts.labelhash), manager],
          }),
        }
      : {
          to: contracts.registry,
          data: encodeFunctionData({
            abi: Abis.v1.ensRegistry,
            functionName: "setOwner",
            args: [data.parts.node, manager],
          }),
        };

  return singleStepPlan(client, {
    operation: "name.setManager",
    account: options.account,
    description: "Set manager",
    calls: [{ ...target, value: 0n }],
  });
});

const write = Action.write(
  "name.setManager",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options) => options.name,
    () => ["setManager" as const],
  ),
);

/** @internal Implementation of `Actions.name.setManager`. */
export const setManager = write.send;

/** @internal Implementation of `Actions.name.setManagerSync`. */
export const setManagerSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.name.setManager`. */
export const setManagerMethods = write.methods;
