import { Effect } from "effect";

import { watchBlockNumber } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { fromCause } from "../../../errors/translate/fromCause.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { get } from "../get/effect.js";
import type { watch as Promises } from "./index.js";

/** @internal Implementation of `Actions.event.watch`. */
export const watch = Effect.fn("ensforge.event.watch")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const name = yield* normalizeName(options.name);
  const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
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
      const poll = async () => {
        try {
          const events = await runPromise(
            get(client, { name, fromBlock, toBlock: blockNumber, types: options.types }),
          );
          last = blockNumber;
          if (events.length > 0) options.onEvents(events);
        } catch (error) {
          options.onError?.(fromCause(error, { operation: "event.watch", name }) as AnyError);
        } finally {
          running = false;
        }
      };
      void poll();
    },
    onError: (error) =>
      options.onError?.(fromCause(error, { operation: "event.watch", name }) as AnyError),
  });
}, Action.withContext("event.watch"));
