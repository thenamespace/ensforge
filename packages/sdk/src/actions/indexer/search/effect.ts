import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { queryOf } from "../../../internal/indexer/input.js";
import type { search as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.search`. */
export const search = Effect.fn("ensforge.indexer.search")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const query = options.query.trim().toLowerCase();
  if (query === "") {
    return yield* Effect.fail(
      new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "query", input: options.query }),
    );
  }

  return yield* callIndexer(client, "search", { ...queryOf(options), query });
}, Action.withContext("indexer.search"));
