import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { contractInput, queryOf } from "../../../internal/indexer/input.js";
import type { getResolverRoles as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getResolverRoles`. */
export const getResolverRoles = Effect.fn("ensforge.indexer.getResolverRoles")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const contract = yield* contractInput(client, options);

  return yield* callIndexer(client, "getResolverRoles", { ...queryOf(options), ...contract });
}, Action.withContext("indexer.getResolverRoles"));
