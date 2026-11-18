import { Effect } from "effect";

import { watchBlockNumber } from "viem/actions";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { toAnyError } from "../../../internal/anyError.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { get } from "../get/effect.js";
import type { watch as Promises } from "./index.js";

/** @internal Implementation of `Actions.event.watch`. */
export const watch = Effect.fn("ensforge.event.watch")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const name = yield* normalizeName(options.name);
  const context = yield* Effect.context();
  const runPromise = Effect.runPromiseWith(context);
  let last: bigint | undefined;
  let running = false;

  // Each new block range is read like `event.get`, so a resolver or subregistry change while
  // watching is followed from the next block on.
  return watchBlockNumber(client.publicClient, {
    emitOnBegin: true,
    ...(options.pollingInterval === undefined ? {} : { pollingInterval: options.pollingInterval }),
    onBlockNumber: (blockNumber) => {
      if (last === undefined) {
        last = blockNumber;
        return;
      }
      if (running || blockNumber <= last) return;
      const fromBlock = last + 1n;
      running = true;
      // oxlint-disable-next-line effecttsgo/async-function -- the watcher's callbacks are Promise-based, so a poll is a Promise
      const poll = async () => {
        try {
          const events = await runPromise(
            get(client, { name, fromBlock, toBlock: blockNumber, types: options.types }),
          );
          last = blockNumber;
          if (events.length > 0) options.onEvents(events);
        } catch (error) {
          options.onError?.(toAnyError(error, { operation: "event.watch", name }));
        } finally {
          running = false;
        }
      };
      void poll();
    },
    onError: (error) => options.onError?.(toAnyError(error, { operation: "event.watch", name })),
  });
}, Action.withContext("event.watch"));
