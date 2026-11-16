import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, maxUint64 } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
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
import { namehash } from "../../../utils/Name.js";
import type { setChildFuses as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.wrapper.setChildFuses`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  if (options.fuses === undefined && options.expiry === undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "fuses",
        shortMessage: "Nothing to write: pass `fuses` or `expiry`.",
      }),
    );
  }
  if (options.expiry !== undefined && (options.expiry < 0n || options.expiry > maxUint64)) {
    return yield* Effect.fail(
      new InvalidInputError({ code: "INVALID_EXPIRY", input: options.expiry }),
    );
  }

  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  yield* requireProtocol(loaded, "v1", "the NameWrapper");

  const { parts } = loaded.data;
  const contracts = yield* requireV1Contracts(client);
  if (!loaded.state.wrapped) {
    return yield* Effect.fail(new NameStateError({ code: "NAME_NOT_WRAPPED" }));
  }
  if (parts.isEth2ld) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: parts.name,
        shortMessage:
          ".eth names have no parent owner; their owner burns fuses with wrapper.setFuses.",
      }),
    );
  }
  const fuses = yield* fuseMask(options.fuses ?? [], loaded.data.v1?.wrapper.fuses ?? 0, "parent");

  return singleStepPlan(client, {
    operation: "wrapper.setChildFuses",
    account: options.account,
    description: "Set child fuses",
    calls: [
      {
        to: contracts.nameWrapper,
        data: encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "setChildFuses",
          // An expiry below the current one keeps it; the NameWrapper caps it at the parent's.
          args: [
            namehash(parts.name.slice(parts.name.indexOf(".") + 1)),
            parts.labelhash,
            fuses,
            options.expiry ?? 0n,
          ],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("wrapper.setChildFuses", plan, { contractKind: "wrapper" });

/** @internal Implementation of `Actions.wrapper.setChildFuses`. */
export const setChildFuses = write.send;

/** @internal Implementation of `Actions.wrapper.setChildFusesSync`. */
export const setChildFusesSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.wrapper.setChildFuses`. */
export const setChildFusesMethods = write.methods;
