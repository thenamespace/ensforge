import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionData } from "viem";

import type { Client } from "../../client/types.js";
import { PlanError } from "../../errors/classes/PlanError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Rpc from "../rpc/index.js";

/**
 * `PLAN_STALE` for a prepared plan whose ENSv2 token transfer no longer matches the name's token:
 * granting or revoking roles regenerates the token ID, so the transfer of the old ID reverts as
 * `ERC1155InsufficientBalance` although the account still owns the name. Other registry calls take
 * any version of the ID and cannot go stale this way. `undefined` when `error` is anything else.
 */
export const staleTransfer = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  error: AnyError,
): Effect.fn.Return<AnyError | undefined> {
  if (error.context.revert?.errorName !== "ERC1155InsufficientBalance") return undefined;

  for (const call of plan.steps.flatMap((step) => step.calls)) {
    const transfer = (() => {
      try {
        return decodeFunctionData({ abi: Abis.v2.permissionedRegistry, data: call.data });
      } catch {
        return undefined;
      }
    })();
    if (transfer?.functionName !== "safeTransferFrom") continue;

    const [, , tokenId] = transfer.args;
    const current = yield* Rpc.readContractOrUndefined(client, {
      address: call.to,
      abi: Abis.v2.permissionedRegistry,
      functionName: "getTokenId",
      args: [tokenId],
    }).pipe(Effect.orElseSucceed(() => undefined));
    if (current !== undefined && current !== tokenId) {
      return new PlanError({
        code: "PLAN_STALE",
        details: [`Token ${tokenId} of ${call.to} is now ${current}.`],
        hint: "The name's roles changed since the plan was prepared, which gave it a new token ID. Prepare the plan again.",
        cause: error,
        context: { ...error.context, contract: call.to, registry: call.to },
      });
    }
  }
  return undefined;
});
