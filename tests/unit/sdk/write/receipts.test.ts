import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { receiptsOf, waitForReceipts } from "@ensforge/sdk/internal/internal/write/receipts";
import { sendSequential } from "@ensforge/sdk/internal/internal/write/transport";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure } from "@ensforge/test-harness";
import { pad } from "viem";

import { account, scriptedWallet } from "./wallet";

const [first, second, third] = [pad("0x1"), pad("0x2"), pad("0x3")];

describe("receipts", () => {
  it.effect("returns every receipt in order, the last one as the write's receipt", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = makePlan({ operation: "test", chainId: 1, account, steps: [] });
      const result = { hash: third, hashes: [first, second, third], id: undefined, plan };

      const synced = yield* waitForReceipts(wallet.client, result, {});

      assert.deepStrictEqual(
        synced.receipts.map((receipt) => receipt.transactionHash),
        [first, second, third],
      );
      assert.strictEqual(synced.receipt.transactionHash, third);
      assert.strictEqual(synced.hash, third);
      assert.strictEqual(synced.plan, plan);
    }),
  );

  it.effect("fails on the first transaction that reverted", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ reverting: ["0x02"] });
      // Sending does not wait for the last receipt, which then reverts.
      const hashes = yield* sendSequential(wallet.client, wallet.signer, {
        id: "pay",
        description: "Approve and pay",
        calls: [
          { to: account, data: "0x01", value: 0n },
          { to: account, data: "0x02", value: 0n },
        ],
      });

      const error = yield* expectFailure(receiptsOf(wallet.client, hashes), {
        _tag: "TransactionError",
        code: "TRANSACTION_REVERTED",
      });

      assert.strictEqual(error.hash, second);
    }),
  );

  it.effect("gives up on a receipt after the write's timeout", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ unmined: [first] });

      yield* expectFailure(receiptsOf(wallet.client, [first], { timeout: 20 }), {
        _tag: "TransactionError",
        code: "RECEIPT_TIMEOUT",
      });
    }),
  );
});
