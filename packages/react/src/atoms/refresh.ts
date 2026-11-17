import { Effect, Schedule } from "effect";
import { Reactivity } from "effect/reactivity";

import type { Ensforge, Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import type { Hex } from "viem";
import { waitForTransactionReceipt } from "viem/actions";

import { invalidationKeys, writeSubjects } from "./subjects.js";

const hashesOf = (value: unknown): readonly Hex[] =>
  typeof value === "object" && value !== null && "hashes" in value
    ? (value as Write.Result).hashes
    : [];

const isMined = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "receipts" in value;

// Indexers lag the chain. Their reads refresh once the indexer reports the write's block, polled
// for up to a minute; indexers without a status are given a few seconds instead.
const indexerCaughtUp = (client: Ensforge.Client, block: bigint) =>
  Actions.indexer.getStatus(client).pipe(
    Effect.flatMap((status) =>
      (status.chains[client.chain.id]?.indexed ?? -1n) >= block
        ? Effect.void
        : Effect.fail("behind" as const),
    ),
    Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 30 }),
    Effect.catch(() => Effect.sleep("5 seconds")),
  );

/**
 * Refreshes the reads a write touched: chain reads once its transactions are mined, indexer
 * reads once the indexer has indexed them. Runs in the background; a write's result never waits
 * for it.
 */
export const refreshAfterWrite = (
  client: Ensforge.Client,
  options: unknown,
  value: unknown,
): Effect.Effect<void, never, Reactivity.Reactivity> => {
  const subjects = writeSubjects(options, value as Write.Result | undefined);
  const hashes = hashesOf(value);
  const last = hashes.at(-1);

  const mined =
    last === undefined || isMined(value)
      ? Effect.undefined
      : Effect.promise(() => waitForTransactionReceipt(client.publicClient, { hash: last }));

  return Effect.gen(function* () {
    const receipt = yield* mined;
    yield* Reactivity.invalidate(invalidationKeys(client, "chain", subjects));

    if (client.config.indexer === undefined) return;
    const block =
      receipt?.blockNumber ??
      (yield* Effect.promise(() => client.publicClient.request({ method: "eth_blockNumber" })).pipe(
        Effect.map(BigInt),
      ));
    yield* indexerCaughtUp(client, block);
    yield* Reactivity.invalidate(invalidationKeys(client, "indexer", subjects));
  }).pipe(Effect.ignore);
};
