import { Effect } from "effect";

import { encodeFunctionData, hexToBigInt, isAddressEqual } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import { baseRegistrarAbi, ensRegistryAbi } from "../../../internal/abis/v1.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { addressOf } from "../../../internal/write/signer.js";
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
    state.manager !== null &&
    isAddressEqual(account, state.manager) &&
    (state.registrant === null || !isAddressEqual(account, state.registrant));

  const target =
    data.parts.isEth2ld && !actsAsManager
      ? {
          to: contracts.baseRegistrar,
          data: encodeFunctionData({
            abi: baseRegistrarAbi,
            functionName: "reclaim",
            args: [hexToBigInt(data.parts.labelhash), manager],
          }),
        }
      : {
          to: contracts.registry,
          data: encodeFunctionData({
            abi: ensRegistryAbi,
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

const write = Action.write("name.setManager", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.name.setManager`. */
export const setManager = write.send;

/** @internal Implementation of `Actions.name.setManagerSync`. */
export const setManagerSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.name.setManager`. */
export const setManagerMethods = write.methods;
