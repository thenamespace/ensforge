import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { sameAddress } from "../../../internal/address.js";
import { loadName } from "../../../internal/name/load.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { resolverOwnerOf } from "../../../internal/permission/facts.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import { addressOf } from "../../../internal/write/signer.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setDelegate as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.approval.setDelegate`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const delegate = yield* requireAddress(options.delegate, "delegate");
  const loaded = yield* loadName(client, options.name);
  const resolver = loaded.state.resolver;
  if (resolver === null) {
    return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
  }
  if ((yield* setterKeying(client, resolver)) === "name") {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature: "delegates",
        shortMessage: "PermissionedResolvers use roles, not delegates.",
        hint: "Use permission.setRecordAccess.",
      }),
    );
  }

  // The resolver keeps a delegate under the account that approves it and honours only the name
  // owner's: anyone else's approval would change nothing.
  const signer = addressOf(options.account) ?? client.account;
  const owner = resolverOwnerOf(client, loaded);
  if (signer !== undefined && !sameAddress(owner, signer)) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "NOT_OWNER",
        account: signer,
        hint: "Only the name's owner can give it a delegate.",
      }),
    );
  }

  return singleStepPlan(client, {
    operation: "approval.setDelegate",
    account: options.account,
    description: options.approved ? "Approve delegate" : "Revoke delegate",
    calls: [
      {
        to: resolver,
        data: encodeFunctionData({
          abi: Abis.v1.publicResolver,
          functionName: "approve",
          args: [loaded.data.parts.node, delegate, options.approved],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("approval.setDelegate", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.approval.setDelegate`. */
export const setDelegate = write.send;

/** @internal Implementation of `Actions.approval.setDelegateSync`. */
export const setDelegateSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.approval.setDelegate`. */
export const setDelegateMethods = write.methods;
