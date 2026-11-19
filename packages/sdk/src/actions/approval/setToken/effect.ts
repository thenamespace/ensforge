import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { approvableToken, l2ApprovableToken } from "../../../internal/approval/token.js";
import { loadName } from "../../../internal/name/load.js";
import {
  l2WriteTargetOf,
  requireAddress,
  requireRegistered,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setToken as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.approval.setToken`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const to = options.to === null ? zeroAddress : yield* requireAddress(options.to, "to");
  const loaded = yield* loadName(client, options.name);
  // A name ENS does not hold may live on an L2: its token is approved there.
  const l2 = yield* l2WriteTargetOf(client, loaded);
  if (l2 === null) yield* requireRegistered(client, loaded);
  const token =
    l2 === null
      ? yield* approvableToken(client, loaded)
      : yield* l2ApprovableToken(l2.client, l2.location, loaded.data.parts);

  return singleStepPlan(l2?.client ?? client, {
    operation: "approval.setToken",
    account: options.account,
    description: options.to === null ? "Clear approval" : "Approve name",
    calls: [
      {
        to: token.contract,
        data: encodeFunctionData({
          abi: Abis.v1.baseRegistrar,
          functionName: "approve",
          args: [to, token.tokenId],
        }),
        value: 0n,
      },
    ],
  });
});

// Approving a token takes the same authority as transferring it.
const write = Action.write(
  "approval.setToken",
  plan,
  { contractKind: "registrar" },
  explainFor(
    (options) => options.name,
    () => ["transfer" as const],
  ),
);

/** @internal Implementation of `Actions.approval.setToken`. */
export const setToken = write.send;

/** @internal Implementation of `Actions.approval.setTokenSync`. */
export const setTokenSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.approval.setToken`. */
export const setTokenMethods = write.methods;
