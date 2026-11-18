import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Fiber, String as Str } from "effect";
import { TestClock } from "effect/testing";

import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { waitForChainTime } from "@ensforge/sdk/internal/internal/write/transport";
import { scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, numberToHex } from "viem";
import { mainnet } from "viem/chains";

import { paramsOf } from "./wallet";

const committedAt = 1_800_000_000n;

describe("waitForChainTime", () => {
  // Devnets and forks move chain time ahead of wall time: the wait follows the chain, not the
  // remaining seconds.
  it.effect("returns at the next poll once the chain passes the target", () =>
    Effect.gen(function* () {
      let timestamp = committedAt;
      const { transport, calls } = scriptedTransport(({ method }) =>
        method === "eth_getBlockByNumber"
          ? {
              number: "0x1",
              hash: `0x${Str.repeat(32)("11")}`,
              timestamp: numberToHex(timestamp),
              transactions: [],
            }
          : undefined,
      );
      const client = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport, pollingInterval: 4_000 }),
      });

      const wait = yield* waitForChainTime(client, committedAt + 61n).pipe(Effect.forkChild);
      yield* TestClock.adjust("1 second");
      timestamp = committedAt + 120n;
      yield* TestClock.adjust("4 seconds");
      yield* Fiber.join(wait);

      assert.strictEqual(
        Arr.filter(calls, (call) => call.method === "eth_getBlockByNumber").length,
        2,
      );
    }),
  );

  it.effect("returns at once when the chain is exactly at the target", () =>
    Effect.gen(function* () {
      const { transport, calls } = scriptedTransport(({ method }) =>
        method === "eth_getBlockByNumber"
          ? {
              number: "0x1",
              hash: `0x${Str.repeat(32)("11")}`,
              timestamp: numberToHex(committedAt),
              transactions: [],
            }
          : undefined,
      );
      const client = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
      });

      yield* waitForChainTime(client, committedAt);

      assert.deepStrictEqual(
        Arr.map(calls, ({ params }) => paramsOf(params)[0]),
        ["latest"],
      );
    }),
  );

  // With polling slower than the time left, the next check comes when the target should be reached.
  it.effect("sleeps no longer than the time left", () =>
    Effect.gen(function* () {
      let timestamp = committedAt;
      const { transport, calls } = scriptedTransport(({ method }) =>
        method === "eth_getBlockByNumber"
          ? {
              number: "0x1",
              hash: `0x${Str.repeat(32)("11")}`,
              timestamp: numberToHex(timestamp),
              transactions: [],
            }
          : undefined,
      );
      const client = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport, pollingInterval: 600_000 }),
      });

      const wait = yield* waitForChainTime(client, committedAt + 61n).pipe(Effect.forkChild);
      yield* TestClock.withLive(Effect.sleep("10 millis"));
      timestamp = committedAt + 61n;
      yield* TestClock.adjust("61 seconds");
      yield* Fiber.join(wait);

      assert.strictEqual(calls.length, 2);
    }),
  );
});
