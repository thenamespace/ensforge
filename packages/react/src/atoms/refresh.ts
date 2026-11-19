import { Effect, Predicate, Schedule } from "effect";
import { Reactivity } from "effect/reactivity";

import type { Ensforge, Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { waitForTransactionReceipt } from "viem/actions";

import { invalidationKeys, writeSubjects } from "./subjects.js";

/**
 * Refreshes the reads a write touched: chain reads once its transactions are mined, indexer
 * reads once the indexer has indexed them. Both are watched on the chain the plan ran on, an L2
 * for names that live there. Runs in the background; a write's result never waits for it.
 * Without a result (a write that failed after a step was confirmed), nothing is left to wait for
 * and the signer is the client's account.
 *
 * @stability unstable
 */
export const refreshAfterWrite = Effect.fnUntraced(function* (
  client: Ensforge.Client,
  options: unknown,
  written: Write.Result | undefined,
): Effect.fn.Return<void, never, Reactivity.Reactivity> {
  const subjects = writeSubjects(options, written?.plan.account ?? client.account);
  const chainId = written?.plan.chainId ?? client.chain.id;
  const last =
    written === undefined || Predicate.hasProperty(written, "receipts")
      ? undefined
      : written.hashes.at(-1);

  // Chain reads refresh even when the receipt wait fails or times out (viem gives up after three
  // minutes): the transactions may have landed anyway.
  const minedIn = yield* (
    last === undefined
      ? Effect.undefined
      : Effect.tryPromise({
          try: (signal) =>
            waitForTransactionReceipt(client.client(chainId), { hash: last, signal }),
          catch: () => "receipt-failed" as const,
        }).pipe(
          Effect.map((receipt) => receipt.blockNumber),
          Effect.orElseSucceed(() => undefined),
        )
  ).pipe(Effect.ensuring(Reactivity.invalidate(invalidationKeys(client, "chain", subjects))));

  if (client.config.indexer === undefined) return;
  yield* Effect.gen(function* () {
    const block =
      minedIn ??
      (yield* Effect.tryPromise({
        try: () => client.client(chainId).request({ method: "eth_blockNumber" }),
        catch: () => "block-number-failed" as const,
      }).pipe(Effect.map(BigInt)));

    // Indexers lag the chain. Their reads refresh once the indexer reports the write's block,
    // polled for up to a minute; indexers without a status are given a few seconds instead.
    yield* Actions.indexer.getStatus(client).pipe(
      Effect.flatMap((status) =>
        (status.chains[chainId]?.indexed ?? -1n) >= block
          ? Effect.void
          : Effect.fail("behind" as const),
      ),
      Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 30 }),
      Effect.catch(() => Effect.sleep("5 seconds")),
    );
    yield* Reactivity.invalidate(invalidationKeys(client, "indexer", subjects));
  }).pipe(Effect.ignoreCause());
});
