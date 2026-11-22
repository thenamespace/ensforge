import { Effect, Array as Arr, Option } from "effect";

import type { Address, Hex } from "viem";
import {
  call as viemCall,
  estimateGas as viemEstimateGas,
  getBlock,
  simulateBlocks,
  simulateCalls,
} from "viem/actions";

import type { Client } from "../../client/types.js";
import { ContractRevertError } from "../../errors/classes/ContractRevertError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { toAnyError } from "../anyError.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { withHeadroom } from "./gas.js";

/**
 * Steps that can run against current state: everything before the first wait. Later steps depend
 * on time passing after earlier ones are mined (e.g. register after commit): {@link simulatePlan}
 * runs them in later simulated blocks when the node can, and they are simulated again right
 * before they are sent.
 */
export const simulatableSteps = (plan: Plan): readonly Plan.Step[] => {
  const firstWait = Arr.findFirstIndex(plan.steps, (step) => step.waitFor !== undefined);
  return Option.isNone(firstWait) ? plan.steps : Arr.take(plan.steps, firstWait.value);
};

/** The outcome of one call: its error when it failed, and the gas it used. */
type CallOutcome = { readonly error: AnyError | undefined; readonly gas: bigint | undefined };

/** One simulated call's outcome, with a revert without data reported as a revert. */
const outcomeOf = (
  result: {
    readonly status: "success" | "failure";
    readonly data: Hex;
    readonly error?: unknown;
    readonly gasUsed: bigint;
  },
  context: {
    readonly contract: Address | undefined;
    readonly account: Address | undefined;
    readonly chainId: number;
  },
): Effect.Effect<CallOutcome> => {
  const error =
    result.status === "success"
      ? Effect.undefined
      : // A failure is always a revert; without data viem reports it as "zero data", which
        // would read as a missing contract.
        result.data === "0x"
        ? Effect.succeed(
            new ContractRevertError({
              code: "CONTRACT_REVERTED",
              data: "0x",
              context: { ...context, revert: { errorName: undefined, data: "0x" } },
            }),
          )
        : toAnyError(result.error, context);
  return Effect.map(error, (failure) => ({ error: failure, gas: result.gasUsed }));
};

/**
 * Runs `calls` in order with `eth_simulateV1`, so each call sees the state the previous ones
 * leave (an approval before a payment, a resolver change before records).
 */
const simulateSequence = (
  client: Client,
  account: Address | undefined,
  calls: readonly Plan.Call[],
): Effect.Effect<readonly CallOutcome[], AnyError> =>
  fromPromise(
    () =>
      simulateCalls(client.client(), {
        ...(account === undefined ? {} : { account }),
        calls: Arr.map(calls, (call) => ({ to: call.to, data: call.data, value: call.value })),
      }),
    { account, chainId: client.chain.id },
  ).pipe(
    Effect.flatMap(({ results }) =>
      Effect.forEach(
        results,
        (result, index) =>
          outcomeOf(result, { contract: calls[index]?.to, account, chainId: client.chain.id }),
        { concurrency: "unbounded" },
      ),
    ),
  );

/**
 * Runs every step with `eth_simulateV1`, one simulated block per wait: each block after a wait is
 * timed that long after the one before, so a registration is simulated after its commitment has
 * aged. `None` when the node ignores the times asked for (a step after a wait would then fail
 * only because no time passed); fails when it cannot simulate blocks.
 */
const simulateAcrossWaits = Effect.fnUntraced(function* (
  client: Client,
  account: Address | undefined,
  steps: readonly Plan.Step[],
): Effect.fn.Return<Option.Option<readonly CallOutcome[]>, AnyError> {
  const segments = Arr.reduce(steps, [] as Plan.Step[][], (blocks, step) => {
    const last = blocks.at(-1);
    if (last === undefined || step.waitFor !== undefined) blocks.push([step]);
    else last.push(step);
    return blocks;
  });
  const latest = yield* fromPromise(() => getBlock(client.client()));
  // Every block a second after the one before it, plus its wait.
  let time = latest.timestamp;
  const blocks = Arr.map(segments, (segment, index) => {
    time += 1n + (segment[0]?.waitFor?.seconds ?? 0n);
    const calls = Arr.flatMap(segment, (step) => step.calls);
    return {
      calls,
      time,
      request: {
        blockOverrides: { number: latest.number + BigInt(index) + 1n, time },
        calls: Arr.map(calls, (call) => ({
          ...(account === undefined ? {} : { account }),
          to: call.to,
          data: call.data,
          value: call.value,
        })),
      },
    };
  });

  const simulated = yield* fromPromise(
    () => simulateBlocks(client.client(), { blocks: Arr.map(blocks, (block) => block.request) }),
    { account, chainId: client.chain.id },
  );
  const honoured = Arr.every(blocks, (block, index) => simulated[index]?.timestamp === block.time);
  if (!honoured) return Option.none();
  const outcomes = yield* Effect.forEach(
    Arr.flatMap(blocks, (block, index) =>
      Arr.map(block.calls, (call, position) => ({
        call,
        result: simulated[index]?.calls[position],
      })),
    ),
    ({ call, result }) =>
      result === undefined
        ? Effect.succeed({ error: undefined, gas: undefined })
        : outcomeOf(result, { contract: call.to, account, chainId: client.chain.id }),
    { concurrency: "unbounded" },
  );
  return Option.some(outcomes);
});

/** Fallback for RPCs without `eth_simulateV1`: each call alone against current state. */
const simulateEach = (
  client: Client,
  account: Address | undefined,
  calls: readonly Plan.Call[],
): Effect.Effect<readonly CallOutcome[]> =>
  Effect.forEach(
    calls,
    (call) =>
      fromPromise(
        () =>
          viemCall(client.client(), {
            to: call.to,
            data: call.data,
            value: call.value,
            ...(account === undefined ? {} : { account }),
          }),
        { contract: call.to, account, chainId: client.chain.id },
      ).pipe(
        Effect.match({
          onFailure: (error): CallOutcome => ({ error, gas: undefined }),
          onSuccess: (): CallOutcome => ({ error: undefined, gas: undefined }),
        }),
      ),
    { concurrency: 1 },
  );

const simulateCallsInOrder = (
  client: Client,
  account: Address | undefined,
  calls: readonly Plan.Call[],
): Effect.Effect<readonly CallOutcome[]> =>
  simulateSequence(client, account, calls).pipe(
    Effect.catch(() => simulateEach(client, account, calls)),
  );

/** Splits per-call outcomes back into per-step results. */
const stepResults = (
  steps: readonly Plan.Step[],
  outcomes: readonly CallOutcome[],
): Plan.Simulation["steps"] => {
  let offset = 0;
  return Arr.map(steps, (step) => {
    const own = outcomes.slice(offset, offset + step.calls.length);
    offset += step.calls.length;
    const error = Option.getOrUndefined(
      Arr.findFirst(own, (outcome) => outcome.error !== undefined),
    )?.error;
    return error === undefined ? { id: step.id, ok: true } : { id: step.id, ok: false, error };
  });
};

/**
 * Simulates one step against current state, its calls in order.
 *
 * @stability unstable
 */
export const simulateStep = (
  client: Client,
  step: Plan.Step,
  account: Address | undefined,
): Effect.Effect<Plan.Simulation["steps"][number]> =>
  simulateCallsInOrder(client, account, step.calls).pipe(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `stepResults` returns one entry per step
    Effect.map((outcomes) => stepResults([step], outcomes)[0] as Plan.Simulation["steps"][number]),
  );

/**
 * Simulates every simulatable step in order, each seeing the effects of the ones before.
 *
 * @stability unstable
 */
export const simulatePlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.fn.Return<Plan.Simulation> {
  // Steps after a wait run in later simulated blocks; nodes without that see only the steps
  // before the first wait.
  const across =
    simulatableSteps(plan).length < plan.steps.length
      ? yield* simulateAcrossWaits(client, account, plan.steps).pipe(
          Effect.orElseSucceed(() => Option.none()),
        )
      : Option.none<readonly CallOutcome[]>();
  const steps = Option.isSome(across) ? plan.steps : simulatableSteps(plan);
  const outcomes = Option.isSome(across)
    ? across.value
    : yield* simulateCallsInOrder(
        client,
        account,
        Arr.flatMap(steps, (step) => step.calls),
      );
  const results = stepResults(steps, outcomes);

  return { ok: Arr.every(results, (step) => step.ok), plan, steps: results };
});

/**
 * Sums the gas and ETH of every simulatable call. Gas comes from the in-order simulation when
 * the RPC supports it, so calls that depend on earlier ones are estimated correctly, and each
 * call gets the headroom the SDK sends it with.
 */
export const estimatePlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.fn.Return<Plan.Estimate, AnyError> {
  const calls = Arr.flatMap(simulatableSteps(plan), (step) => step.calls);
  const simulated = yield* simulateSequence(client, account, calls).pipe(
    Effect.map((outcomes) =>
      Arr.every(outcomes, (outcome) => outcome.gas !== undefined) ? outcomes : undefined,
    ),
    Effect.orElseSucceed(() => undefined),
  );
  const failed = Option.getOrUndefined(
    Arr.findFirst(simulated ?? [], (outcome) => outcome.error !== undefined),
  )?.error;
  if (failed !== undefined) return yield* Effect.fail(failed);

  const gas =
    (simulated === undefined ? undefined : Arr.map(simulated, (outcome) => outcome.gas ?? 0n)) ??
    (yield* Effect.forEach(
      calls,
      (call) =>
        fromPromise(
          () =>
            viemEstimateGas(client.client(), {
              to: call.to,
              data: call.data,
              value: call.value,
              ...(account === undefined ? {} : { account }),
            }),
          { contract: call.to, account },
        ),
      { concurrency: 1 },
    ));

  return {
    plan,
    gas: Arr.reduce(gas, 0n, (total, value) => total + withHeadroom(value)),
    value: Arr.reduce(plan.calls, 0n, (total, call) => total + call.value),
  };
});
