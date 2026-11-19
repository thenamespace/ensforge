import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { l2DelegateTarget } from "../../../internal/approval/delegate.js";
import { loadName } from "../../../internal/name/load.js";
import { requireAddress } from "../../../internal/name/write.js";
import { resolverOwnerOf } from "../../../internal/permission/facts.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getDelegate as Promises } from "./index.js";

/** @internal Implementation of `Actions.approval.getDelegate`. */
export const getDelegate = Effect.fn("ensforge.approval.getDelegate")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const delegate = yield* requireAddress(options.delegate, "delegate");
    const loaded = yield* loadName(client, options.name, options);
    // A Basenames or Linea name's resolver keeps its delegates on its L2.
    const l2 = yield* l2DelegateTarget(client, loaded);
    const resolver = l2 === null ? loaded.state.resolver : l2.resolver;
    if (resolver === null) {
      return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
    }
    const owner =
      options.owner === undefined
        ? l2 === null
          ? resolverOwnerOf(client, loaded)
          : l2.owner
        : yield* requireAddress(options.owner, "owner");
    if (owner === null) return false;

    // Resolvers without delegates (e.g. a PermissionedResolver) answer nothing: no delegate.
    const approved = yield* Rpc.readContractOrUndefined(l2?.client ?? client, {
      address: resolver,
      abi: Abis.v1.publicResolver,
      functionName: "isApprovedFor",
      args: [owner, loaded.data.parts.node, delegate],
    });
    return approved === true;
  },
  Action.withContext("approval.getDelegate", { contractKind: "resolver" }),
);
