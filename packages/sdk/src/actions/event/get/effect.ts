import { Effect, Array as Arr } from "effect";

import { getBlockNumber } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { knownContracts } from "../../../internal/event/classify.js";
import { decodeLogs } from "../../../internal/event/decode.js";
import { nameLogs } from "../../../internal/event/sources.js";
import { loadName } from "../../../internal/name/load.js";
import { parseName } from "../../../internal/name/normalize.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.event.get`. */
export const get = Effect.fn("ensforge.event.get")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  // Validate the name before reading the head block.
  yield* parseName(options.name);
  const toBlock =
    options.toBlock === undefined || options.toBlock === "latest"
      ? yield* fromPromise(() => getBlockNumber(client.publicClient, { cacheTime: 0 }))
      : options.toBlock;
  if (options.fromBlock < 0n || options.fromBlock > toBlock) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "fromBlock",
        input: options.fromBlock,
        shortMessage: "`fromBlock` must not be after `toBlock`.",
      }),
    );
  }

  // The name's contracts as of `toBlock`: its resolver and registries then.
  const loaded = yield* loadName(client, options.name, { blockNumber: toBlock });
  const logs = yield* nameLogs(
    client,
    loaded,
    { fromBlock: options.fromBlock, toBlock },
    options.maxRequests,
  );

  const events = decodeLogs(knownContracts(client), logs, loaded.data.parts.name);
  const { types } = options;
  return types === undefined ? events : Arr.filter(events, (event) => types.includes(event.type));
}, Action.withContext("event.get"));
