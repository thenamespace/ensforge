import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { fuseMask } from "../../../internal/wrapper/fuses.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Fuse from "../../../utils/Fuse.js";
import type { setFuses as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.wrapper.setFuses`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "the NameWrapper");

  const contracts = yield* requireV1Contracts(client);
  if (!loaded.state.wrapped) {
    return yield* Effect.fail(new NameStateError({ code: "NAME_NOT_WRAPPED" }));
  }
  const burned = loaded.data.v1?.wrapper.fuses ?? 0;
  if (Fuse.has(burned, "cannotBurnFuses")) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "FUSE_BURNED",
        shortMessage: "The cannotBurnFuses fuse is burned.",
      }),
    );
  }
  const fuses = yield* fuseMask(options.fuses, burned, "owner");

  return singleStepPlan(client, {
    operation: "wrapper.setFuses",
    account: options.account,
    description: "Burn fuses",
    calls: [
      {
        to: contracts.nameWrapper,
        data: encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "setFuses",
          args: [loaded.data.parts.node, fuses],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("wrapper.setFuses", plan, { contractKind: "wrapper" });

/** @internal Implementation of `Actions.wrapper.setFuses`. */
export const setFuses = write.send;

/** @internal Implementation of `Actions.wrapper.setFusesSync`. */
export const setFusesSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.wrapper.setFuses`. */
export const setFusesMethods = write.methods;
