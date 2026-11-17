import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer, orNotFound } from "../../../internal/indexer/call.js";
import type { getNamespace as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getNamespace`. */
export const getNamespace = Effect.fn("ensforge.indexer.getNamespace")(function* (
  client: Client,
  options: Promises.Options = {},
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const namespace = options.namespace ?? "ens";
  const result = yield* callIndexer(client, "getNamespace", { namespace });

  return yield* orNotFound(result, options.strict, namespace);
}, Action.withContext("indexer.getNamespace"));
