import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { queryOf } from "../../../internal/indexer/input.js";
import { requireAddress } from "../../../internal/name/write.js";
import type { getResolvers as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getResolvers`. */
export const getResolvers = Effect.fn("ensforge.indexer.getResolvers")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const roleHolder = yield* requireAddress(options.roleHolder, "roleHolder");

  return yield* callIndexer(client, "getResolvers", { ...queryOf(options), roleHolder });
}, Action.withContext("indexer.getResolvers"));
