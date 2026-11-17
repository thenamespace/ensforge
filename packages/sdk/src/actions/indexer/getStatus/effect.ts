import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import type { getStatus as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getStatus`. */
export const getStatus = Effect.fn("ensforge.indexer.getStatus")(function* (
  client: Client,
  _options: Promises.Options = {},
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  return yield* callIndexer(client, "getStatus", {});
}, Action.withContext("indexer.getStatus"));
