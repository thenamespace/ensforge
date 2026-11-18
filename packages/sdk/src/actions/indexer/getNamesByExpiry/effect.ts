import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { optionalName, queryOf } from "../../../internal/indexer/input.js";
import type { getNamesByExpiry as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getNamesByExpiry`. */
export const getNamesByExpiry = Effect.fn("ensforge.indexer.getNamesByExpiry")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const parent = yield* optionalName(options.parent);

  return yield* callIndexer(client, "getNamesByExpiry", {
    ...queryOf(options),
    namespace: options.namespace ?? "ens",
    parent,
  });
}, Action.withContext("indexer.getNamesByExpiry"));
