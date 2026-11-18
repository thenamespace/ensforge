import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { loadName } from "../../../internal/name/load.js";
import { parentOf } from "../../../internal/name/parts.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Fuse from "../../../utils/Fuse.js";
import { namehash } from "../../../utils/Name.js";
import type { unwrap as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.wrapper.unwrap`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "the NameWrapper");

  const { state, data } = loaded;
  const { parts } = data;
  const contracts = yield* requireV1Contracts(client);
  if (!state.wrapped) return yield* Effect.fail(new NameStateError({ code: "NAME_NOT_WRAPPED" }));
  if (Fuse.has(data.v1?.wrapper.fuses ?? 0, "cannotUnwrap")) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "FUSE_BURNED",
        shortMessage: "The cannotUnwrap fuse is burned.",
      }),
    );
  }

  const owner = yield* requireAddress(
    options.owner ?? addressOf(options.account) ?? client.account ?? state.owner ?? "",
    "owner",
  );
  const calldata = parts.isEth2ld
    ? encodeFunctionData({
        abi: Abis.v1.nameWrapper,
        functionName: "unwrapETH2LD",
        args: [parts.labelhash, owner, owner],
      })
    : encodeFunctionData({
        abi: Abis.v1.nameWrapper,
        functionName: "unwrap",
        args: [namehash(parentOf(parts.name)), parts.labelhash, owner],
      });

  return singleStepPlan(client, {
    operation: "wrapper.unwrap",
    account: options.account,
    description: "Unwrap name",
    calls: [{ to: contracts.nameWrapper, data: calldata, value: 0n }],
  });
});

const write = Action.write("wrapper.unwrap", plan, { contractKind: "wrapper" });

/** @internal Implementation of `Actions.wrapper.unwrap`. */
export const unwrap = write.send;

/** @internal Implementation of `Actions.wrapper.unwrapSync`. */
export const unwrapSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.wrapper.unwrap`. */
export const unwrapMethods = write.methods;
