import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { nameInput, queryOf } from "../../../internal/indexer/input.js";
import type { getSubnames as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getSubnames`. */
export const getSubnames = Effect.fn("ensforge.indexer.getSubnames")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const input = yield* nameInput(options.name, options.namespace);

  return yield* callIndexer(client, "getSubnames", { ...queryOf(options), ...input });
}, Action.withContext("indexer.getSubnames"));
