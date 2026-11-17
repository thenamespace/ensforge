import { Effect } from "effect";

import type { Hex, TransactionReceipt } from "viem";
import { waitForTransactionReceipt } from "viem/actions";

import type { Client } from "../../client/types.js";
import { TransactionError } from "../../errors/classes/TransactionError.js";
import type { AnyError } from "../../errors/types.js";
import type { Write } from "../../Types.js";
import { fromPromise } from "../rpc/fromPromise.js";

/** Waits for the receipts of `hashes` in order and fails when one reverted. */
export const receiptsOf = Effect.fnUntraced(function* (
  client: Client,
  hashes: readonly Hex[],
  options: Pick<Write.SyncOptions, "confirmations" | "timeout"> = {},
): Effect.fn.Return<TransactionReceipt[], AnyError> {
  const receipts: TransactionReceipt[] = [];

  for (const hash of hashes) {
    const receipt = yield* fromPromise(() =>
      waitForTransactionReceipt(client.publicClient, {
        hash,
        confirmations: options.confirmations ?? 1,
        ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
      }),
    );
    if (receipt.status === "reverted") {
      return yield* Effect.fail(new TransactionError({ code: "TRANSACTION_REVERTED", hash }));
    }
    receipts.push(receipt);
  }
  return receipts;
});

/** Waits for every receipt of a write and fails when one reverted. */
export const waitForReceipts = Effect.fnUntraced(function* (
  client: Client,
  result: Write.Result,
  options: Write.SyncOptions,
): Effect.fn.Return<Write.SyncResult, AnyError> {
  const receipts = yield* receiptsOf(client, result.hashes, options);

  const receipt = receipts.at(-1);
  if (receipt === undefined) throw new Error("write produced no receipts");

  return { ...result, receipt, receipts };
});
