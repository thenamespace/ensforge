import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { approvalContract, nameApprovalTarget } from "../../../internal/approval/contract.js";
import { requireAddress } from "../../../internal/name/write.js";
import { blockAt } from "../../../internal/rpc/block.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getOperator as Promises } from "./index.js";

/** @internal Implementation of `Actions.approval.getOperator`. */
export const getOperator = Effect.fn("ensforge.approval.getOperator")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const owner = yield* requireAddress(options.owner, "owner");
  const operator = yield* requireAddress(options.operator, "operator");
  const { client: target, contract } =
    options.name === undefined
      ? { client, contract: yield* approvalContract(client, options.contract) }
      : yield* nameApprovalTarget(client, options.name, options);

  // `isApprovedForAll(owner, operator)` has the same selector on every ENS and ERC-721 contract.
  return yield* Rpc.readContract(target, {
    address: contract,
    abi: Abis.shared.erc1155,
    functionName: "isApprovedForAll",
    args: [owner, operator],
    // A block number of the ENS chain means nothing on an L2.
    ...(target === client ? blockAt(options) : {}),
  });
}, Action.withContext("approval.getOperator"));
