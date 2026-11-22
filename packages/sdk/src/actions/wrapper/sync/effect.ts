import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { singleStepPlan } from "../../../internal/name/write.js";
import { parseEthNames } from "../../../internal/registration/labels.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { sync as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.wrapper.sync`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const renewer = client.deployment.v2?.migration.ethRenewerV1;
  if (renewer === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "NameWrapper sync" }),
    );
  }
  const names = yield* parseEthNames(options.names);

  return singleStepPlan(client, {
    operation: "wrapper.sync",
    account: options.account,
    description: "Sync the NameWrapper",
    calls: [
      {
        to: renewer,
        data: encodeFunctionData({
          abi: Abis.v2.ethRenewerV1,
          functionName: "syncWrapper",
          args: [Arr.map(names, (name) => name.label)],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("wrapper.sync", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.wrapper.sync`. */
export const sync = write.send;

/** @internal Implementation of `Actions.wrapper.syncSync`. */
export const syncSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.wrapper.sync`. */
export const syncMethods = write.methods;
