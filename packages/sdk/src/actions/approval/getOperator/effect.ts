import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { approvalContract } from "../../../internal/approval/contract.js";
import { requireAddress } from "../../../internal/name/write.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getOperator as Promises } from "./index.js";

/** @internal Implementation of `Actions.approval.getOperator`. */
export const getOperator = Effect.fn("ensforge.approval.getOperator")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const owner = yield* requireAddress(options.owner, "owner");
  const operator = yield* requireAddress(options.operator, "operator");
  const contract = yield* approvalContract(client, options.contract);

  // `isApprovedForAll(owner, operator)` has the same selector on every ENS contract.
  return yield* Rpc.readContract(client, {
    address: contract,
    abi: Abis.shared.erc1155,
    functionName: "isApprovedForAll",
    args: [owner, operator],
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  });
}, Action.withContext("approval.getOperator"));
