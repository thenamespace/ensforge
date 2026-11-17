import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { nameInput, queryOf } from "../../../internal/indexer/input.js";
import { requireAddress } from "../../../internal/name/write.js";
import type { getHistory as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getHistory`. */
export const getHistory = Effect.fn("ensforge.indexer.getHistory")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  if (options.name !== undefined) {
    const input = yield* nameInput(options.name, options.namespace);
    return yield* callIndexer(client, "getHistory", { ...queryOf(options), ...input });
  }

  const address = yield* requireAddress(options.address, "address");
  return yield* callIndexer(client, "getHistory", {
    ...queryOf(options),
    name: undefined,
    address,
  });
}, Action.withContext("indexer.getHistory"));
