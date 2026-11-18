import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { coinInput, optionalName, queryOf } from "../../../internal/indexer/input.js";
import { requireAddress } from "../../../internal/name/write.js";
import type { getNamesForAddress as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getNamesForAddress`. */
export const getNamesForAddress = Effect.fn("ensforge.indexer.getNamesForAddress")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const address = yield* requireAddress(options.address, "address");
  const coinType = yield* coinInput(options.coin);
  const parent = yield* optionalName(options.parent);
  const { coin: _coin, ...query } = queryOf(options);

  return yield* callIndexer(client, "getNamesForAddress", { ...query, address, coinType, parent });
}, Action.withContext("indexer.getNamesForAddress"));
