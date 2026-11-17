import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer, orNotFound } from "../../../internal/indexer/call.js";
import { contractInput, queryOf } from "../../../internal/indexer/input.js";
import type { getResolver as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getResolver`. */
export const getResolver = Effect.fn("ensforge.indexer.getResolver")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const contract = yield* contractInput(client, options);
  const result = yield* callIndexer(client, "getResolver", { ...queryOf(options), ...contract });

  return yield* orNotFound(result, options.strict, contract.address);
}, Action.withContext("indexer.getResolver"));
