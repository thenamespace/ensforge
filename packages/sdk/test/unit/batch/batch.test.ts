import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { expectFailure, scriptedTransport, type RecordedCall } from "@ensforge/test-harness";
import { callScript } from "@ensforge/test-harness/multicall";
import {
  createPublicClient,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  getAddress,
} from "viem";
import { mainnet } from "viem/chains";

import { getOperator } from "#/actions/approval/getOperator/index";
import { batch as batchEffect } from "#/batch/effect";
import { batch } from "#/batch/index";
import { create } from "#/client/create";
import type { CreateOptions } from "#/client/types";
import type { AnyError } from "#/errors/types";
import type { Request } from "#/Types";

const contract = getAddress("0x00000000000000000000000000000000000000c3");
const owner = getAddress("0x00000000000000000000000000000000000000a1");
const approved = getAddress("0x00000000000000000000000000000000000000a2");
const stranger = getAddress("0x00000000000000000000000000000000000000a3");
const reverting = getAddress("0x00000000000000000000000000000000000000a4");

const isApproved = (result: boolean) =>
  encodeFunctionResult({ abi: Abis.shared.erc1155, functionName: "isApprovedForAll", result });

/** A chain where `approved` is an operator of `owner`, and asking about `reverting` reverts. */
const chain = callScript(mainnet.contracts.multicall3.address, ({ to, data }) => {
  if (to !== contract) return undefined;

  const { args } = decodeFunctionData({ abi: Abis.shared.erc1155, data });
  if (args[1] === reverting) {
    return {
      success: false,
      returnData: encodeErrorResult({ abi: Abis.shared.errors, errorName: "Unauthorised" }),
    };
  }
  return { success: true, returnData: isApproved(args[1] === approved) };
});

const setup = (options: Omit<CreateOptions, "publicClient"> = {}) => {
  const { transport, calls } = scriptedTransport(chain);
  const publicClient = createPublicClient({ chain: mainnet, transport });
  return { publicClient, ens: create({ publicClient, ...options }), calls };
};

const ethCalls = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.method === "eth_call").length;

const operatorRequest = (operator: string, blockNumber?: bigint) =>
  getOperator.request({ owner, operator, contract, blockNumber });

describe("batch request shapes", () => {
  it.effect("answers a list as a tuple in one multicall", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup();
      const { results } = yield* batchEffect(ens, {
        requests: [operatorRequest(approved), operatorRequest(stranger), operatorRequest(approved)],
      });

      assert.deepStrictEqual(results, [
        { status: "success", result: true },
        { status: "success", result: false },
        { status: "success", result: true },
      ]);
      assert.strictEqual(ethCalls(calls), 1);
    }),
  );

  it.effect("answers a record under the same keys", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup();
      const { results } = yield* batchEffect(ens, {
        requests: { yes: operatorRequest(approved), no: operatorRequest(stranger) },
      });

      assert.deepStrictEqual(results, {
        yes: { status: "success", result: true },
        no: { status: "success", result: false },
      });
      assert.strictEqual(ethCalls(calls), 1);
    }),
  );
});

describe("batch RPC budget", () => {
  it.effect("groups reads per block", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup();
      yield* batchEffect(ens, {
        requests: [
          operatorRequest(approved, 20_000_000n),
          operatorRequest(stranger, 20_000_000n),
          operatorRequest(approved, 20_000_001n),
          operatorRequest(approved),
        ],
      });

      assert.strictEqual(ethCalls(calls), 3);
    }),
  );

  it.effect("sends one call per read with multicall disabled", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup({ batch: { multicall: false } });
      const { results } = yield* batchEffect(ens, {
        requests: [operatorRequest(approved), operatorRequest(stranger)],
      });

      assert.deepStrictEqual(results, [
        { status: "success", result: true },
        { status: "success", result: false },
      ]);
      assert.strictEqual(ethCalls(calls), 2);
    }),
  );
});

describe("batch failure isolation", () => {
  it.effect("a reverting read fails alone with its translated error", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup();
      const { results } = yield* batchEffect(ens, {
        requests: [
          operatorRequest(approved),
          operatorRequest(reverting),
          operatorRequest(stranger),
        ],
      });
      const [first, failed, last] = results;

      assert.deepStrictEqual(first, { status: "success", result: true });
      assert.deepStrictEqual(last, { status: "success", result: false });
      assert.strictEqual(failed.status, "failure");
      if (failed.status === "failure") {
        assert.strictEqual(failed.error.code, "NOT_OWNER");
        assert.strictEqual(failed.error.context.operation, "approval.getOperator");
        assert.strictEqual(failed.error.context.contract, contract);
      }
      assert.strictEqual(ethCalls(calls), 1);
    }),
  );

  it.effect("invalid input fails before any RPC", () =>
    Effect.gen(function* () {
      const { ens, calls } = setup();
      const { results } = yield* batchEffect(ens, { requests: [operatorRequest("0xnope")] });
      const [failed] = results;

      assert.strictEqual(failed.status, "failure");
      if (failed.status === "failure") assert.strictEqual(failed.error.code, "INVALID_ADDRESS");
      assert.strictEqual(ethCalls(calls), 0);
    }),
  );

  it.effect("a request that is not a batchable read fails alone", () =>
    Effect.gen(function* () {
      const { ens } = setup();
      const write: Request<never, AnyError> = { path: "record.set", options: {} };
      const { results } = yield* batchEffect(ens, { requests: [write, operatorRequest(approved)] });
      const [failed, succeeded] = results;

      assert.deepStrictEqual(succeeded, { status: "success", result: true });
      assert.strictEqual(failed.status, "failure");
      if (failed.status === "failure") {
        assert.strictEqual(failed.error._tag, "InvalidInputError");
        assert.strictEqual(failed.error.code, "INVALID_RECORD_VALUE");
        assert.include(failed.error, { field: "requests", input: "record.set" });
        assert.strictEqual(failed.error.context.operation, "record.set");
      }
    }),
  );

  it.effect("a failed multicall fails every read in it with the same error", () =>
    Effect.gen(function* () {
      const { transport, calls } = scriptedTransport(({ method }) =>
        method === "eth_call" ? "0x" : undefined,
      );
      const ens = create({ publicClient: createPublicClient({ chain: mainnet, transport }) });
      const { results } = yield* batchEffect(ens, {
        requests: [operatorRequest(approved), operatorRequest(stranger)],
      });

      assert.deepStrictEqual(
        results.map((result) => (result.status === "failure" ? result.error.code : "success")),
        ["CONTRACT_NOT_DEPLOYED", "CONTRACT_NOT_DEPLOYED"],
      );
      assert.strictEqual(ethCalls(calls), 1);
    }),
  );
});

describe("batch with allowFailure: false", () => {
  it.effect("returns plain values", () =>
    Effect.gen(function* () {
      const { ens } = setup();
      const { results } = yield* batchEffect(ens, {
        requests: [operatorRequest(approved), operatorRequest(stranger)],
        allowFailure: false,
      });

      assert.deepStrictEqual(results, [true, false]);
    }),
  );

  it.effect("rejects with the failing read's error", () =>
    Effect.gen(function* () {
      const { ens } = setup();
      yield* expectFailure(
        batchEffect(ens, {
          requests: [operatorRequest(approved), operatorRequest(reverting)],
          allowFailure: false,
        }),
        { _tag: "UnauthorizedError", code: "NOT_OWNER" },
      );
    }),
  );
});

describe("batch cancellation", () => {
  it.effect("rejects with the abort reason", () =>
    Effect.gen(function* () {
      const { publicClient } = setup();
      // The caller's own controller is what `signal` is for.
      // @effect-diagnostics-next-line abortControllerInEffect:off
      const controller = new AbortController();
      const reason = new Error("cancelled");
      controller.abort(reason);

      const error = yield* Effect.flip(
        Effect.tryPromise({
          try: () =>
            batch(publicClient, {
              requests: [operatorRequest(approved)],
              signal: controller.signal,
            }),
          catch: (cause) => ({ cause }),
        }),
      );

      assert.strictEqual(error.cause, reason);
    }),
  );
});
