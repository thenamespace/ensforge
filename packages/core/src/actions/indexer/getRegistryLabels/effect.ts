import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { contractInput, optionalAddress, queryOf } from "../../../internal/indexer/input.js";
import type { getRegistryLabels as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getRegistryLabels`. */
export const getRegistryLabels = Effect.fn("ensforge.indexer.getRegistryLabels")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const contract = yield* contractInput(client, options);
  const owner = yield* optionalAddress(options.owner, "owner");
  const excludeOwner = yield* optionalAddress(options.excludeOwner, "excludeOwner");

  return yield* callIndexer(client, "getRegistryLabels", {
    ...queryOf(options),
    ...contract,
    owner,
    excludeOwner,
  });
}, Action.withContext("indexer.getRegistryLabels"));
