import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import type { Plan } from "@ensforge/sdk";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { estimatePlan, simulatePlan } from "@ensforge/sdk/internal/internal/write/simulate";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import {
  encodeErrorResult,
  getAddress,
  hexToBigInt,
  isHex,
  numberToHex,
  pad,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

import { paramsOf, recordOf, requestsOf, simulatedCalls } from "./wallet";

const account = getAddress("0x00000000000000000000000000000000000a11ce");
const target: Address = "0x00000000000000000000000000000000000000c0";
const reason = encodeErrorResult({
  abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
  errorName: "Error",
  args: ["not allowed"],
});

/**
 * A client whose node simulates calls in order with `eth_simulateV1` (unless `sequential` is off,
 * as on nodes without it, where calls run one by one with `eth_call`): each call uses 21,000 gas
 * and reverts with the data `reverts` gives for it.
 */
const node = (reverts: Readonly<Record<Hex, Hex>> = {}, sequential = true) => {
  const { transport, calls } = scriptedTransport(({ method, params }) => {
    const request = recordOf(paramsOf(params)[0]);
    if (method === "eth_simulateV1") {
      if (!sequential)
        throw Object.assign(new Error("eth_simulateV1 does not exist"), { code: -32601 });
      return [
        {
          number: "0x1",
          hash: pad("0x1"),
          timestamp: "0x1",
          gasLimit: "0x1c9c380",
          gasUsed: "0x0",
          transactions: [],
          calls: Arr.map(simulatedCalls(request) ?? [], ({ data }) => {
            const revert = isHex(data) ? reverts[data] : undefined;
            return revert === undefined
              ? { status: "0x1", returnData: "0x", gasUsed: "0x5208", logs: [] }
              : {
                  status: "0x0",
                  returnData: revert,
                  gasUsed: "0x5208",
                  logs: [],
                  error: { code: 3, message: "execution reverted", data: revert },
                };
          }),
        },
      ];
    }
    if (method === "eth_call" || method === "eth_estimateGas") {
      const revert = isHex(request.data) ? reverts[request.data] : undefined;
      if (revert !== undefined)
        throw Object.assign(new Error("execution reverted"), { code: -32000, data: revert });
      return method === "eth_call" ? "0x" : "0x5208";
    }
    return undefined;
  });
  const client = Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport },
    publicRpc: false,
  });
  return { client, calls };
};

const call = (data: Hex): Plan.Call => ({ to: target, data, value: 0n });

// The commit and the approval run against current state; the registration waits for chain time.
const plan = makePlan({
  operation: "test",
  chainId: 1,
  account,
  steps: [
    { id: "commit", description: "commit", calls: [call("0x01")] },
    { id: "approve", description: "approve", calls: [call("0x02"), call("0x03")] },
    { id: "register", description: "register", calls: [call("0x04")], waitFor: { seconds: 60n } },
  ],
});

/** A block as a node returns it. */
const block = (number: bigint, timestamp: bigint) => ({
  number: numberToHex(number),
  hash: pad(numberToHex(number)),
  timestamp: numberToHex(timestamp),
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  transactions: [],
});

/**
 * A node that simulates each requested block at the time asked for (block 100 at time 1000 is
 * the latest), so steps after a wait run after it; `reverts` as for {@link node}.
 */
const timedNode = (reverts: Readonly<Record<Hex, Hex>> = {}, honoursTimes = true) => {
  const { transport, calls } = scriptedTransport(({ method, params }) => {
    if (method === "eth_getBlockByNumber") return block(100n, 1000n);
    if (method !== "eth_simulateV1") return undefined;
    const blocks = recordOf(paramsOf(params)[0]).blockStateCalls;
    return Arr.map(Arr.isArray(blocks) ? blocks : [], (requested, index) => {
      const { blockOverrides, calls: blockCalls } = recordOf(requested);
      const overrides = recordOf(blockOverrides);
      // Blocks follow the latest (100 at time 1000); a node that ignores the times asked for puts
      // each a second after the one before.
      const next = 101n + BigInt(index);
      const time =
        honoursTimes && isHex(overrides.time) ? hexToBigInt(overrides.time) : next + 900n;
      return {
        ...block(next, time),
        calls: Arr.map(Arr.isArray(blockCalls) ? blockCalls : [], (simulated) => {
          const { data } = recordOf(simulated);
          const revert = isHex(data) ? reverts[data] : undefined;
          return revert === undefined
            ? { status: "0x1", returnData: "0x", gasUsed: "0x5208", logs: [] }
            : {
                status: "0x0",
                returnData: revert,
                gasUsed: "0x5208",
                logs: [],
                error: { code: 3, message: "execution reverted", data: revert },
              };
        }),
      };
    });
  });
  const client = Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport },
    publicRpc: false,
  });
  return { client, calls };
};

describe("simulatePlan", () => {
  it.effect("runs the steps before the first wait in order and reports each step's error", () =>
    Effect.gen(function* () {
      const { client, calls } = node({ "0x03": "0x" });

      const simulation = yield* simulatePlan(client, plan, account);

      assert.strictEqual(simulation.ok, false);
      assert.strictEqual(simulation.plan, plan);
      assert.deepStrictEqual(
        Arr.map(simulation.steps, ({ id, ok }) => [id, ok]),
        [
          ["commit", true],
          ["approve", false],
        ],
      );
      // A revert without data would read as a missing contract; it is a revert.
      const error = simulation.steps[1]?.error;
      assert.strictEqual(error?._tag, "ContractRevertError");
      assert.strictEqual(error?.code, "CONTRACT_REVERTED");
      assert.strictEqual(Reflect.get(error ?? {}, "data"), "0x");
      assert.deepStrictEqual(error?.context.revert, { errorName: undefined, data: "0x" });
      assert.strictEqual(error?.context.contract, target);
      assert.strictEqual(error?.context.account, account);
      const [request] = requestsOf(calls, "eth_simulateV1");
      const simulated = simulatedCalls(request ?? {});
      assert.deepStrictEqual(
        // viem appends a call of its own.
        Arr.map(Arr.take(simulated ?? [], 3), ({ from, to, data }) => ({ from, to, data })),
        Arr.map(["0x01", "0x02", "0x03"], (data) => ({ from: account, to: target, data })),
      );
    }),
  );

  it.effect("decodes a revert reason and reports a plan without failures as ok", () =>
    Effect.gen(function* () {
      const failing = yield* simulatePlan(node({ "0x01": reason }).client, plan, account);
      const passing = yield* simulatePlan(node().client, plan, undefined);

      assert.strictEqual(failing.steps[0]?.error?.context.revert?.errorName, "Error");
      assert.strictEqual(failing.steps[0]?.error?.context.contract, target);
      assert.deepStrictEqual(passing, {
        ok: true,
        plan,
        steps: [
          { id: "commit", ok: true },
          { id: "approve", ok: true },
        ],
      });
    }),
  );

  it.effect("simulates without a sender when the write has no account", () =>
    Effect.gen(function* () {
      const { client, calls } = node();

      yield* simulatePlan(client, plan, undefined);

      const [request] = requestsOf(calls, "eth_simulateV1");
      const simulated = simulatedCalls(request ?? {});
      assert.isDefined(simulated);
      assert.isTrue(
        Arr.every(simulated ?? [], (simulatedCall) => simulatedCall.from === undefined),
      );
    }),
  );

  // Nodes without `eth_simulateV1` run each call alone against current state.
  it.effect("falls back to one eth_call per call on nodes without eth_simulateV1", () =>
    Effect.gen(function* () {
      const { client, calls } = node({ "0x02": reason }, false);

      const simulation = yield* simulatePlan(client, plan, account);

      assert.deepStrictEqual(
        Arr.map(simulation.steps, ({ id, ok, error }) => [id, ok, error?.context.contract]),
        [
          ["commit", true, undefined],
          ["approve", false, target],
        ],
      );
      assert.deepStrictEqual(
        Arr.map(requestsOf(calls, "eth_call"), (request) => [request.from, request.data]),
        [
          [account, "0x01"],
          [account, "0x02"],
          [account, "0x03"],
        ],
      );

      const { client: anonymous, calls: anonymousCalls } = node({}, false);
      yield* simulatePlan(anonymous, plan, undefined);
      assert.isTrue(
        Arr.every(requestsOf(anonymousCalls, "eth_call"), (request) => request.from === undefined),
      );
    }),
  );
});

describe("estimatePlan", () => {
  it.effect("sums the in-order simulation's gas, with headroom, without estimating again", () =>
    Effect.gen(function* () {
      const { client, calls } = node();

      const estimate = yield* estimatePlan(client, plan, account);

      assert.strictEqual(estimate.gas, 3n * 25_200n);
      assert.strictEqual(Arr.filter(calls, ({ method }) => method === "eth_estimateGas").length, 0);
    }),
  );

  it.effect("fails with the error of a call that would revert", () =>
    Effect.gen(function* () {
      const error = yield* expectFailure(
        estimatePlan(node({ "0x02": reason }).client, plan, account),
        {
          _tag: "ContractRevertError",
        },
      );

      assert.strictEqual(error.context.revert?.errorName, "Error");
    }),
  );

  it.effect("estimates each call as the account on nodes without eth_simulateV1", () =>
    Effect.gen(function* () {
      const { client, calls } = node({}, false);

      yield* estimatePlan(client, plan, account);
      const { client: anonymous, calls: anonymousCalls } = node({}, false);
      yield* estimatePlan(anonymous, plan, undefined);

      const senders = (recorded: typeof calls) =>
        Arr.map(requestsOf(recorded, "eth_estimateGas"), (request) => request.from);
      assert.deepStrictEqual(senders(calls), [account, account, account]);
      assert.deepStrictEqual(senders(anonymousCalls), [undefined, undefined, undefined]);
    }),
  );

  it.effect("names the contract of a call whose estimate fails", () =>
    Effect.gen(function* () {
      const error = yield* expectFailure(
        estimatePlan(node({ "0x03": reason }, false).client, plan, account),
        {
          _tag: "ContractRevertError",
        },
      );

      assert.strictEqual(error.context.contract, target);
      assert.strictEqual(error.context.account, account);
    }),
  );
});

// A registration is simulated after its commitment has aged, so its failures show before the
// commitment is paid for.
describe("simulatePlan across waits", () => {
  it.effect("runs the steps after a wait in a block timed after it", () =>
    Effect.gen(function* () {
      const { client, calls } = timedNode({ "0x04": reason });

      const simulation = yield* simulatePlan(client, plan, account);

      assert.deepStrictEqual(
        Arr.map(simulation.steps, ({ id, ok }) => [id, ok]),
        [
          ["commit", true],
          ["approve", true],
          ["register", false],
        ],
      );
      const error = simulation.steps[2]?.error;
      assert.strictEqual(error?._tag, "ContractRevertError");
      assert.strictEqual(error?.context.contract, target);
      const [request] = requestsOf(calls, "eth_simulateV1");
      const blocks = request?.blockStateCalls;
      // One request: blocks after the latest (100 at time 1000), each call from the account.
      assert.deepStrictEqual(
        Arr.map(Arr.isArray(blocks) ? blocks : [], (requested) => {
          const { blockOverrides, calls: blockCalls } = recordOf(requested);
          return [
            recordOf(blockOverrides),
            Arr.map(
              Arr.isArray(blockCalls) ? blockCalls : [],
              (simulated) => recordOf(simulated).from,
            ),
          ];
        }),
        [
          [{ number: numberToHex(101n), time: numberToHex(1001n) }, [account, account, account]],
          [{ number: numberToHex(102n), time: numberToHex(1001n + 1n + 60n) }, [account]],
        ],
      );
    }),
  );

  // A step after a wait would then fail only because no time passed.
  it.effect("falls back to the steps before the first wait on a node that ignores the times", () =>
    Effect.gen(function* () {
      const { client } = timedNode({ "0x04": reason }, false);

      const simulation = yield* simulatePlan(client, plan, account);

      assert.strictEqual(simulation.ok, true);
      assert.deepStrictEqual(
        Arr.map(simulation.steps, ({ id }) => id),
        ["commit", "approve"],
      );
    }),
  );

  it.effect("simulates a plan without waits in one block at current state", () =>
    Effect.gen(function* () {
      const { client, calls } = timedNode();
      const single = makePlan({
        operation: "test",
        chainId: 1,
        account,
        steps: [{ id: "write", description: "write", calls: [call("0x01")] }],
      });

      yield* simulatePlan(client, single, account);

      assert.deepStrictEqual(requestsOf(calls, "eth_getBlockByNumber"), []);
    }),
  );

  it.effect(
    "falls back to the steps before the first wait on a node without block simulation",
    () =>
      Effect.gen(function* () {
        const { client } = node();

        const simulation = yield* simulatePlan(client, plan, account);

        assert.deepStrictEqual(
          Arr.map(simulation.steps, ({ id }) => id),
          ["commit", "approve"],
        );
      }),
  );
});
