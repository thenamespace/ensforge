import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { addressOf } from "../../../internal/write/signer.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { reclaim as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.name.reclaim`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "reclaim");

  const { state, data } = loaded;
  const contracts = yield* requireV1Contracts(client);
  if (!data.parts.isEth2ld || state.wrapped) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: "v1",
        feature: "reclaim of names other than unwrapped .eth second-level names",
      }),
    );
  }

  const owner = yield* requireAddress(
    options.owner ?? addressOf(options.account) ?? client.account ?? state.registrant ?? "",
    "owner",
  );
  const call = {
    to: contracts.baseRegistrar,
    data: encodeFunctionData({
      abi: Abis.v1.baseRegistrar,
      functionName: "reclaim",
      args: [hexToBigInt(data.parts.labelhash), owner],
    }),
    value: 0n,
  };

  return singleStepPlan(client, {
    operation: "name.reclaim",
    account: options.account,
    description: "Reclaim name",
    calls: [call],
  });
});

const write = Action.write(
  "name.reclaim",
  plan,
  { contractKind: "registrar" },
  explainFor(
    (options) => options.name,
    () => ["reclaim" as const],
  ),
);

/** @internal Implementation of `Actions.name.reclaim`. */
export const reclaim = write.send;

/** @internal Implementation of `Actions.name.reclaimSync`. */
export const reclaimSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.name.reclaim`. */
export const reclaimMethods = write.methods;
