import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { nonZeroAddress } from "../../../internal/address.js";
import { approvableToken } from "../../../internal/approval/token.js";
import { loadName } from "../../../internal/name/load.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getToken as Promises } from "./index.js";

/** @internal Implementation of `Actions.approval.getToken`. */
export const getToken = Effect.fn("ensforge.approval.getToken")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const token = yield* approvableToken(client, yield* loadName(client, options.name, options));
  // An expired BaseRegistrar token reverts on `getApproved`; it has no approval then.
  const approved = yield* Rpc.readContractOrUndefined(client, {
    address: token.contract,
    abi: Abis.v1.baseRegistrar,
    functionName: "getApproved",
    args: [token.tokenId],
  });
  return nonZeroAddress(approved);
}, Action.withContext("approval.getToken"));
