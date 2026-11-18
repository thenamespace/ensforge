import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import {
  contractInput,
  optionalAddress,
  optionalName,
  queryOf,
} from "../../../internal/indexer/input.js";
import type { getEvents as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getEvents`. */
export const getEvents = Effect.fn("ensforge.indexer.getEvents")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const name = yield* optionalName(options.name);
  const address = yield* optionalAddress(options.address, "address");
  const contract = yield* optionalAddress(options.contract, "contract");
  const resolver =
    options.resolver === undefined
      ? undefined
      : yield* contractInput(client, options.resolver, "resolver");

  return yield* callIndexer(client, "getEvents", {
    ...queryOf(options),
    name,
    address,
    contract,
    resolver,
  });
}, Action.withContext("indexer.getEvents"));
