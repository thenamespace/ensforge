import { Effect, Predicate, Schedule } from "effect";
import { Reactivity } from "effect/reactivity";

import type { Ensforge, Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { waitForTransactionReceipt } from "viem/actions";

import { invalidationKeys, writeSubjects } from "./subjects.js";

/**
 * Refreshes the reads a write touched: chain reads once its transactions are mined, indexer
 * reads once the indexer has indexed them. Runs in the background; a write's result never waits
 * for it.
 */
export const refreshAfterWrite = Effect.fnUntraced(
  function* (
    client: Ensforge.Client,
    options: unknown,
    value: unknown,
  ): Effect.fn.Return<void, unknown, Reactivity.Reactivity> {
    const subjects = writeSubjects(options, value as Write.Result | undefined);
    const last = Predicate.hasProperty(value, "hashes")
      ? (value as Write.Result).hashes.at(-1)
      : undefined;

    const receipt =
      last === undefined || Predicate.hasProperty(value, "receipts")
        ? undefined
        : yield* Effect.promise(() =>
            waitForTransactionReceipt(client.publicClient, { hash: last }),
          );
    yield* Reactivity.invalidate(invalidationKeys(client, "chain", subjects));

    if (client.config.indexer === undefined) return;
    const block =
      receipt?.blockNumber ??
      (yield* Effect.promise(() => client.publicClient.request({ method: "eth_blockNumber" })).pipe(
        Effect.map(BigInt),
      ));

    // Indexers lag the chain. Their reads refresh once the indexer reports the write's block,
    // polled for up to a minute; indexers without a status are given a few seconds instead.
    yield* Actions.indexer.getStatus(client).pipe(
      Effect.flatMap((status) =>
        (status.chains[client.chain.id]?.indexed ?? -1n) >= block
          ? Effect.void
          : Effect.fail("behind" as const),
      ),
      Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 30 }),
      Effect.catch(() => Effect.sleep("5 seconds")),
    );
    yield* Reactivity.invalidate(invalidationKeys(client, "indexer", subjects));
  },
  (refresh) => Effect.ignore(refresh),
);
