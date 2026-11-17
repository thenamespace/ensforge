import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { requirePermissionedResolver } from "../../../internal/resolver/permissioned.js";
import { blockAt } from "../../../internal/rpc/block.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getLink as Promises } from "./index.js";

/** @internal Implementation of `Actions.resolver.getLink`. */
export const getLink = Effect.fn("ensforge.resolver.getLink")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const loaded = yield* loadName(client, options.name, options);
    const resolver = yield* requirePermissionedResolver(client, loaded, "record links");

    const recordId = yield* Rpc.readContract(client, {
      address: resolver,
      abi: Abis.v2.permissionedResolver,
      functionName: "getRecordId",
      args: [loaded.data.parts.node],
      ...blockAt(options),
    });

    // Record ID 0 means the name has never had records on this resolver.
    if (recordId === 0n) {
      if (options.strict === true) {
        return yield* Effect.fail(
          new NotFoundError({ code: "RECORD_NOT_FOUND", resource: "record set" }),
        );
      }
      return null;
    }
    return { resolver, recordId };
  },
  Action.withContext("resolver.getLink", { contractKind: "resolver" }),
);
