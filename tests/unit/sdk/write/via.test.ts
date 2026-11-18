import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import type { Plan, Write } from "@ensforge/sdk";
import {
  routeOutcome,
  routePlan,
  routeSender,
  sendThroughRoute,
  viaContext,
} from "@ensforge/sdk/internal/internal/write/via";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure } from "@ensforge/test-harness";
import { pad, type Hex } from "viem";

import { account, advancing, scriptedWallet, target } from "./wallet";

const [first, second, third] = [pad("0x1"), pad("0x2"), pad("0x3")];
const step: Plan.Step = {
  id: "a",
  description: "Set records",
  calls: [{ to: target, data: "0x01", value: 0n }],
};

/** A route whose `status` answers each poll from `statuses` in turn, the last repeating. */
const relay = (statuses: readonly Write.Via.Status[]) => {
  const polled: string[] = [];
  const via: Write.Via = {
    id: "relay",
    send: () => Promise.resolve("ref-1"),
    status: (reference) => {
      polled.push(reference);
      return Promise.resolve(
        statuses[Math.min(polled.length - 1, statuses.length - 1)] ?? { status: "pending" },
      );
    },
  };
  return { via, polled };
};

describe("route context", () => {
  it.effect("shows a route the client, its chain, the signer and the wallet", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const seen: Write.Via.Context[] = [];
      const via: Write.Via = {
        id: "relay",
        sender: (context) => {
          seen.push(context);
          return Promise.resolve(target);
        },
      };

      const sender = yield* routeSender(wallet.client, via, account);

      assert.strictEqual(sender, target);
      assert.deepStrictEqual(seen, [
        {
          client: wallet.client,
          chainId: 1,
          account,
          publicClient: wallet.client.publicClient,
          walletClient: wallet.signer.walletClient,
        },
      ]);
      const unrouted = yield* routeSender(wallet.client, undefined, account);

      assert.strictEqual(unrouted, undefined);
    }),
  );

  // A copy of a client carries none of its internal state, so it has no wallet to show.
  it.effect("shows no wallet for a client without one", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();

      const context = yield* viaContext({ ...wallet.client }, account);

      assert.strictEqual(context.walletClient, undefined);
    }),
  );

  it.effect("sends the plan the route prepares, or the plan itself without a route that does", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = makePlan({ operation: "test", chainId: 1, account, steps: [step] });
      const rewritten = { ...plan, steps: [] };

      const prepared = yield* routePlan(
        wallet.client,
        plan,
        { id: "rewrite", prepare: () => Promise.resolve(rewritten) },
        account,
      );

      const unprepared = yield* routePlan(wallet.client, plan, { id: "none" }, account);

      assert.strictEqual(prepared, rewritten);
      assert.strictEqual(unprepared, plan);
    }),
  );
});

describe("route outcome", () => {
  it.effect("asks the route again every 2 seconds until the step is mined", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via, polled } = relay([
        { status: "pending" },
        { status: "success", hashes: [first] },
      ]);
      const context = yield* viaContext(wallet.client, account);

      const fiber = yield* routeOutcome(via, context, "ref-1").pipe(Effect.forkChild);
      yield* TestClock.withLive(Effect.sleep("10 millis"));
      yield* TestClock.adjust("1999 millis");
      const early = polled.length;
      yield* TestClock.adjust("1 millis");

      const hashes = yield* Fiber.join(fiber);

      assert.deepStrictEqual(hashes, [first]);
      assert.strictEqual(early, 1);
      assert.deepStrictEqual(polled, ["ref-1", "ref-1"]);
    }),
  );

  it.effect.each<readonly [string, Write.Via]>([
    ["has no status", { id: "relay", send: () => Promise.resolve("ref-1") }],
    ["failed without transactions", relay([{ status: "failed", reason: "expired" }]).via],
    [
      "failed with an empty list of transactions",
      relay([{ status: "failed", reason: "expired", hashes: [] }]).via,
    ],
  ])("reports nothing to confirm when the route %s", ([, via]) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const context = yield* viaContext(wallet.client, account);

      const outcome = yield* routeOutcome(via, context, "ref-1");

      assert.strictEqual(outcome, undefined);
    }),
  );

  it.effect("fails with the last transaction of an execution that failed on chain", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via } = relay([
        { status: "failed", reason: "out of gas", hashes: [first, second, third] },
      ]);
      const context = yield* viaContext(wallet.client, account);

      const error = yield* expectFailure(routeOutcome(via, context, "ref-1"), {
        _tag: "TransactionError",
        code: "TRANSACTION_REVERTED",
      });

      assert.strictEqual(error.hash, third);
      assert.strictEqual(error.shortMessage, "The relay execution failed: out of gas");
    }),
  );
});

describe("sendThroughRoute", () => {
  it.effect("reports the reference before following the step to its transactions", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via, polled } = relay([{ status: "success", hashes: [first] }]);
      const context = yield* viaContext(wallet.client, account);
      const order: string[] = [];

      const hashes = yield* sendThroughRoute(via, context, step, (reference) =>
        Effect.sync(() => order.push(`${reference} after ${polled.length} polls`)),
      );

      assert.deepStrictEqual(hashes, [first] as readonly Hex[]);
      assert.deepStrictEqual(order, ["ref-1 after 0 polls"]);
    }),
  );

  it.effect("fails a step that failed before it was mined", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via } = relay([{ status: "pending" }, { status: "failed", reason: "expired" }]);
      const context = yield* viaContext(wallet.client, account);

      const error = yield* expectFailure(
        advancing(sendThroughRoute(via, context, step, () => Effect.void)),
        { _tag: "TransactionError", code: "TRANSACTION_REVERTED" },
      );

      assert.strictEqual(
        error.shortMessage,
        'The relay execution of "Set records" failed before it was mined.',
      );
    }),
  );
});
