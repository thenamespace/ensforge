import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { nonZeroAddress } from "../../../internal/address.js";
import { approvableToken, l2ApprovableToken } from "../../../internal/approval/token.js";
import { loadName } from "../../../internal/name/load.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getToken as Promises } from "./index.js";

/** @internal Implementation of `Actions.approval.getToken`. */
export const getToken = Effect.fn("ensforge.approval.getToken")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const loaded = yield* loadName(client, options.name, options);
  // A name ENS does not hold may live on an L2: its token is read there.
  const l2 =
    loaded.kind === "available"
      ? yield* Effect.promise(() => import("../../../internal/name/location.js")).pipe(
          Effect.flatMap(({ l2ReadTarget }) => l2ReadTarget(client, loaded.data.parts, {}, true)),
        )
      : null;
  const token =
    l2 === null
      ? yield* approvableToken(client, loaded)
      : yield* l2ApprovableToken(l2.client, l2.location, loaded.data.parts);
  // An expired token reverts on `getApproved`; it has no approval then.
  const approved = yield* Rpc.readContractOrUndefined(l2?.client ?? client, {
    address: token.contract,
    abi: Abis.v1.baseRegistrar,
    functionName: "getApproved",
    args: [token.tokenId],
  });
  return nonZeroAddress(approved);
}, Action.withContext("approval.getToken"));
