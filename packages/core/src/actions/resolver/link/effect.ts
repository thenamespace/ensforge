import { Effect } from "effect";

import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import { permissionedResolverAdminAbi } from "../../../internal/abis/resolver.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { parseName } from "../../../internal/name/normalize.js";
import { requireRegistered, singleStepPlan } from "../../../internal/name/write.js";
import { requirePermissionedResolver } from "../../../internal/resolver/permissioned.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { link as Promises } from "./index.js";

const unknownTarget = (input: unknown) =>
  new InvalidInputError({
    code: "INVALID_RECORD_VALUE",
    field: "to",
    input,
    shortMessage: "The link target has no records on this resolver.",
    hint: "Write a record for the target first, or link to an existing record ID.",
  });

/** @internal Builds the plan of `Actions.resolver.link`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  const resolver = yield* requirePermissionedResolver(client, loaded, "record links");
  const source = loaded.data.parts.dns;

  let data;
  if (typeof options.to === "string") {
    // The contract reverts on unknown targets too; checking first gives a clearer error.
    const target = yield* parseName(options.to);
    const recordId = yield* Rpc.readContract(client, {
      address: resolver,
      abi: permissionedResolverAdminAbi,
      functionName: "getRecordId",
      args: [target.node],
    });
    if (recordId === 0n) return yield* Effect.fail(unknownTarget(options.to));
    data = encodeFunctionData({
      abi: permissionedResolverAdminAbi,
      functionName: "linkToNode",
      args: [source, target.node],
    });
  } else {
    const count = yield* Rpc.readContract(client, {
      address: resolver,
      abi: permissionedResolverAdminAbi,
      functionName: "getRecordCount",
    });
    if (options.to.recordId < 1n || options.to.recordId > count) {
      return yield* Effect.fail(unknownTarget(options.to.recordId));
    }
    data = encodeFunctionData({
      abi: permissionedResolverAdminAbi,
      functionName: "linkToRecord",
      args: [source, options.to.recordId],
    });
  }

  return singleStepPlan(client, {
    operation: "resolver.link",
    account: options.account,
    description: "Link records",
    calls: [{ to: resolver, data, value: 0n }],
  });
});

const write = Action.write("resolver.link", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.resolver.link`. */
export const link = write.send;

/** @internal Implementation of `Actions.resolver.linkSync`. */
export const linkSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.resolver.link`. */
export const linkMethods = write.methods;
