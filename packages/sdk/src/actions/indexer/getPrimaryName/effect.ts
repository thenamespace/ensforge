import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { coinInput, queryOf } from "../../../internal/indexer/input.js";
import { requireAddress } from "../../../internal/name/write.js";
import type { getPrimaryName as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getPrimaryName`. */
export const getPrimaryName = Effect.fn("ensforge.indexer.getPrimaryName")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const address = yield* requireAddress(options.address, "address");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this action's `coin` option does not accept `evm`
  const coinType = (yield* coinInput(options.coin)) as bigint | undefined;
  const { coin: _coin, ...query } = queryOf(options);

  return yield* callIndexer(client, "getPrimaryName", { ...query, address, coinType });
}, Action.withContext("indexer.getPrimaryName"));
