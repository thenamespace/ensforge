import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer, orNotFound } from "../../../internal/indexer/call.js";
import { contractInput, nameInput, queryOf } from "../../../internal/indexer/input.js";
import type { getRecords as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getRecords`. */
export const getRecords = Effect.fn("ensforge.indexer.getRecords")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const input = yield* nameInput(client, options.name, options.namespace);
  const resolver =
    options.resolver === undefined
      ? undefined
      : yield* contractInput(client, options.resolver, "resolver");
  const result = yield* callIndexer(client, "getRecords", {
    ...queryOf(options),
    ...input,
    resolver,
  });

  return yield* orNotFound(result, options.strict, input.name);
}, Action.withContext("indexer.getRecords"));
