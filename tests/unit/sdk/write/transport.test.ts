import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { sendPlan } from "@ensforge/sdk/internal/internal/write/send";
import { sendBatch } from "@ensforge/sdk/internal/internal/write/transport";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure } from "@ensforge/test-harness";
import { pad } from "viem";

import { account, advancing, requestsOf, scriptedWallet, target } from "./wallet";

const bundle = {
  id: "pay",
  description: "Approve and pay",
  calls: [
    { to: target, data: "0x01", value: 0n },
    { to: target, data: "0x02", value: 1n },
  ],
} as const;
const hash = pad("0x1");

describe("sendBatch", () => {
  // Some wallets report success before the receipts exist; the bundle settles with its receipts.
  it.effect("waits while the bundle is pending or reported without receipts", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({
        bundleStatuses: [
          100,
          { code: 200, receipts: "none" },
          { code: 200, receipts: "omitted" },
          200,
        ],
      });

      const result = yield* sendBatch(wallet.client, wallet.signer, bundle, undefined);

      assert.deepStrictEqual(result, { id: `bundle-${hash}`, hashes: [hash] });
      assert.strictEqual(wallet.count("wallet_getCallsStatus"), 4);
      const [request] = requestsOf(wallet.calls, "wallet_sendCalls");
      assert.deepStrictEqual(request?.calls, [
        { to: target, data: "0x01", value: undefined },
        { to: target, data: "0x02", value: "0x1" },
      ]);
      assert.strictEqual(request?.from, account);
      assert.strictEqual(request?.chainId, "0x1");
    }),
  );

  // Any final status from 300 up is a failure, even when the carrying transaction succeeded.
  it.effect.each([300, 500])("fails a bundle that settles with status %s", (status) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [status] });

      const error = yield* expectFailure(sendBatch(wallet.client, wallet.signer, bundle, 1_000), {
        _tag: "TransactionError",
        code: "TRANSACTION_REVERTED",
      });

      assert.strictEqual(error.bundleId, `bundle-${hash}`);
      assert.strictEqual(error.hash, hash);
    }),
  );

  // A final status settles the bundle even before any receipt exists.
  it.effect.each<readonly [number, "none" | "omitted"]>([
    [300, "none"],
    [400, "omitted"],
  ])("fails a bundle that settles with status %s and no receipts", ([code, receipts]) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [{ code, receipts }] });

      const error = yield* expectFailure(sendBatch(wallet.client, wallet.signer, bundle, 1_000), {
        _tag: "TransactionError",
        code: "TRANSACTION_REVERTED",
      });

      assert.strictEqual(error.hash, undefined);
    }),
  );

  it.effect("keeps waiting on a pending bundle that already reports receipts", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [{ code: 100, receipts: "some" }, 200] });

      yield* sendBatch(wallet.client, wallet.signer, bundle, 1_000);

      assert.strictEqual(wallet.count("wallet_getCallsStatus"), 2);
    }),
  );

  it.effect("fails with the account and chain when the user rejects the bundle", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ refused: ["0x02"] });

      const error = yield* expectFailure(sendBatch(wallet.client, wallet.signer, bundle, 1_000), {
        _tag: "UserRejectedError",
      });

      assert.strictEqual(error.context.account, account);
      assert.strictEqual(error.context.chainId, 1);
    }),
  );

  it.effect("fails with the bundle id when it does not settle in time", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [100] });

      const error = yield* expectFailure(sendBatch(wallet.client, wallet.signer, bundle, 20), {
        _tag: "TransactionError",
        code: "RECEIPT_TIMEOUT",
      });

      assert.strictEqual(error.bundleId, `bundle-${hash}`);
    }),
  );

  // viem retries the status request four times, about 3 seconds, before it gives up.
  it.effect("fails with the wallet's error when it loses track of the bundle", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: ["unknown"] });

      const error = yield* expectFailure(sendBatch(wallet.client, wallet.signer, bundle, 10_000), {
        _tag: "InternalError",
      });

      assert.strictEqual(error.context.account, account);
    }),
  );
});

describe("bundle outcome", () => {
  const recorded = pad("0x99");
  const plan = makePlan({
    operation: "test",
    chainId: 1,
    account,
    steps: [{ id: "a", description: "a", calls: bundle.calls }],
  });
  const record = {
    plan,
    status: "failed",
    submitted: {},
    bundles: { a: `bundle-${recorded}` },
    references: {},
    updatedAt: 1,
  } as const;

  // A success without receipts has no transactions to confirm, so the step is sent again.
  it.effect.each(["none", "omitted"] as const)(
    "sends a bundled step again when its bundle reported success with receipts %s",
    (receipts) =>
      Effect.gen(function* () {
        const wallet = scriptedWallet({ bundleStatuses: [{ code: 200, receipts }] });

        yield* advancing(sendPlan(wallet.client, plan, wallet.signer, {}, record));

        assert.deepStrictEqual(wallet.transactions(), [["0x01"], ["0x02"]]);
      }),
  );

  it.effect("asks again every 4 seconds while a bundle sent before is pending", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [100, 200] });

      const fiber = yield* sendPlan(wallet.client, plan, wallet.signer, {}, record).pipe(
        Effect.forkChild,
      );
      yield* TestClock.withLive(Effect.sleep("20 millis"));
      yield* TestClock.adjust("3999 millis");
      yield* TestClock.withLive(Effect.sleep("20 millis"));
      const early = wallet.count("wallet_getCallsStatus");
      yield* TestClock.adjust("1 millis");
      const result = yield* Fiber.join(fiber);

      assert.strictEqual(early, 1);
      assert.deepStrictEqual(result.hashes, [recorded]);
      assert.deepStrictEqual(wallet.transactions(), []);
    }),
  );
});
