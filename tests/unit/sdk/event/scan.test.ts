import { assert, describe, it } from "@effect/vitest";
import { Array, Effect } from "effect";

import { Ensforge } from "@ensforge/sdk";
import { scanLogs, type LogQuery } from "@ensforge/sdk/internal/internal/event/scan";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { hexToBigInt, type Address, type Hex } from "viem";
import { mainnet } from "viem/chains";

import { eventBySignature, logOf, rpcLog, sampleArgs } from "./logs.js";

type Filter = { readonly address: Address[]; readonly fromBlock: Hex; readonly toBlock: Hex };

const emitter: Address = "0x00000000000000000000000000000000000000e1";
const query: LogQuery = { address: [emitter], topics: [null] };
const logAt = (blockNumber: bigint, logIndex = 0) => {
  const addrChanged = eventBySignature("AddrChanged(bytes32,address)");
  return logOf(addrChanged, sampleArgs(addrChanged), { address: emitter, blockNumber, logIndex });
};

/** A client whose `eth_getLogs` answers from `answer`, recording the block ranges requested. */
const ensAnswering = (answer: (from: bigint, to: bigint) => unknown) => {
  const ranges: [bigint, bigint][] = [];
  const { transport, calls } = scriptedTransport(({ method, params }) => {
    if (method !== "eth_getLogs") return undefined;
    // Scripted RPC params are untyped; their shape is fixed by the call under test.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const filter = params[0] as Filter;
    const from = hexToBigInt(filter.fromBlock);
    const to = hexToBigInt(filter.toBlock);
    ranges.push([from, to]);
    return answer(from, to);
  });

  // No transport retries, so each rejected range is requested once.
  const ens = Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: (options) => transport({ ...options, retryCount: 0 }) },
    publicRpc: false,
  });
  return { ens, ranges, calls };
};

describe("scanLogs", () => {
  it.effect("sends one request per query over the whole range", () =>
    Effect.gen(function* () {
      const { ens, ranges, calls } = ensAnswering(() => []);
      const other: Address = "0x00000000000000000000000000000000000000e2";

      yield* scanLogs(ens, [query, { address: [other], topics: [null] }], {
        fromBlock: 10n,
        toBlock: 20n,
      });

      assert.deepStrictEqual(ranges, [
        [10n, 20n],
        [10n, 20n],
      ]);
      assert.deepStrictEqual(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        Array.map(calls, (call) => (call.params as Filter[])[0]?.address),
        [[emitter], [other]],
      );
    }),
  );

  it.effect("skips queries without addresses", () =>
    Effect.gen(function* () {
      const { ens, calls } = ensAnswering(() => []);

      const logs = yield* scanLogs(ens, [{ address: [], topics: [null] }], {
        fromBlock: 0n,
        toBlock: 5n,
      });

      assert.deepStrictEqual(logs, []);
      assert.strictEqual(calls.length, 0);
    }),
  );

  it.effect("splits ranges the provider rejects and reuses the accepted span", () =>
    Effect.gen(function* () {
      // The provider accepts at most 4 blocks per request.
      const { ens, ranges } = ensAnswering((from, to) => {
        if (to - from + 1n > 4n) throw new Error("query exceeds max block range 4");
        return from === 0n ? [rpcLog(logAt(1n))] : [];
      });

      const logs = yield* scanLogs(ens, [query, query], { fromBlock: 0n, toBlock: 15n });

      // Each block is covered once per query; the second query starts at the accepted span.
      assert.deepStrictEqual(ranges, [
        [0n, 15n],
        [0n, 7n],
        [0n, 3n],
        [4n, 7n],
        [8n, 15n],
        [8n, 11n],
        [12n, 15n],
        [0n, 3n],
        [4n, 7n],
        [8n, 11n],
        [12n, 15n],
      ]);
      assert.deepStrictEqual(
        Array.map(logs, (log) => log.blockNumber),
        [1n],
      );
    }),
  );

  it.effect("fails with LOG_RANGE_TOO_LARGE past maxRequests", () =>
    Effect.gen(function* () {
      const { ens, ranges } = ensAnswering(() => {
        throw new Error("block range too large");
      });

      yield* expectFailure(
        scanLogs(ens, [query], { fromBlock: 0n, toBlock: 1_000n }, { maxRequests: 5 }),
        { _tag: "NetworkError", code: "LOG_RANGE_TOO_LARGE" },
      );

      assert.strictEqual(ranges.length, 5);
    }),
  );

  it.effect("does not split on other errors", () =>
    Effect.gen(function* () {
      const { ens, ranges } = ensAnswering(() => {
        throw new Error("upstream unavailable");
      });

      const error = yield* Effect.flip(scanLogs(ens, [query], { fromBlock: 0n, toBlock: 100n }));

      assert.notStrictEqual(error.code, "LOG_RANGE_TOO_LARGE");
      assert.deepStrictEqual(ranges, [[0n, 100n]]);
    }),
  );

  it.effect("dedupes logs matched by several queries and orders them by chain position", () =>
    Effect.gen(function* () {
      const a = logAt(5n, 2);
      const b = logAt(5n, 1);
      const c = logAt(3n, 7);
      let request = 0;
      const { ens } = ensAnswering(() => Array.map(request++ === 0 ? [a, b] : [c, a], rpcLog));

      const logs = yield* scanLogs(ens, [query, query], { fromBlock: 0n, toBlock: 9n });

      assert.deepStrictEqual(
        Array.map(logs, (log) => [log.blockNumber, log.logIndex]),
        [
          [3n, 7],
          [5n, 1],
          [5n, 2],
        ],
      );
    }),
  );
});
