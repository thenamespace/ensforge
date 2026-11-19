import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { encodeFunctionData, hexToBigInt, maxUint64 } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { parentOf } from "../../../internal/name/parts.js";
import {
  requireProtocol,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { fuseMask, requireLockedParent } from "../../../internal/wrapper/fuses.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Fuse from "../../../utils/Fuse.js";
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
  yield* requireRegistered(client, loaded);
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
  const burned = loaded.data.v1?.wrapper.fuses ?? 0;
  const fuses = yield* fuseMask(options.fuses ?? [], burned, "parent");
  if (Fuse.has(burned, "parentCannotControl") && (fuses | burned) !== burned) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "FUSE_BURNED",
        shortMessage: `${parts.name} is emancipated: its parent can no longer burn its fuses.`,
        hint: "Its owner burns owner-controlled fuses with wrapper.setFuses.",
      }),
    );
  }
  const parentNode = namehash(parentOf(parts.name));

  let expiry = options.expiry ?? 0n;
  if ((fuses & nameWrapperFuses.parentControlled) !== 0) {
    const [, parentFuses, parentExpiry] = yield* Rpc.readContract(client, {
      address: contracts.nameWrapper,
      abi: Abis.v1.nameWrapper,
      functionName: "getData",
      args: [hexToBigInt(parentNode)],
    });
    yield* requireLockedParent(options.fuses, fuses, parentFuses);
    // Emancipating with the child's current expiry (often 0) would expire it at once; the
    // parent's expiry is the longest the NameWrapper allows.
    if (options.expiry === undefined && Fuse.has(fuses, "parentCannotControl")) {
      expiry = parentExpiry;
    }
  }

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
          args: [parentNode, parts.labelhash, fuses, expiry],
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
