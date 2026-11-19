import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer, orNotFound } from "../../../internal/indexer/call.js";
import { nameInput, queryOf } from "../../../internal/indexer/input.js";
import type { getName as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getName`. */
export const getName = Effect.fn("ensforge.indexer.getName")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const input = yield* nameInput(client, options.name, options.namespace);
  const result = yield* callIndexer(client, "getName", { ...queryOf(options), ...input });

  return yield* orNotFound(result, options.strict, input.name);
}, Action.withContext("indexer.getName"));
