import { Effect } from "effect";

import type { Address } from "viem";
import { call, estimateGas as viemEstimateGas, simulateCalls } from "viem/actions";

import type { Client } from "../../client/types.js";
import { ContractRevertError } from "../../errors/classes/ContractRevertError.js";
import { fromCause } from "../../errors/translate/fromCause.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { withHeadroom } from "./gas.js";

/**
 * Steps that can run against current state: everything before the first wait. Later steps depend
 * on time passing after earlier ones are mined (e.g. register after commit), so they are
 * simulated right before they are sent.
 */
export const simulatableSteps = (plan: Plan): readonly Plan.Step[] => {
  const firstWait = plan.steps.findIndex((step) => step.waitFor !== undefined);
  return firstWait === -1 ? plan.steps : plan.steps.slice(0, firstWait);
};

/** The outcome of one call: its error when it failed, and the gas it used. */
type CallOutcome = { readonly error: AnyError | undefined; readonly gas: bigint | undefined };

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
      simulateCalls(client.publicClient, {
        ...(account === undefined ? {} : { account }),
        calls: calls.map((item) => ({ to: item.to, data: item.data, value: item.value })),
      }),
    { account },
  ).pipe(
    Effect.map(({ results }) =>
      results.map((result, index) => ({
        error:
          result.status === "success"
            ? undefined
            : // A failure is always a revert; without data viem reports it as "zero data", which
              // would read as a missing contract.
              result.data === "0x"
              ? new ContractRevertError({
                  code: "CONTRACT_REVERTED",
                  data: "0x",
                  context: {
                    contract: calls[index]?.to,
                    account,
                    revert: { errorName: undefined, data: "0x" },
                  },
                })
              : (fromCause(result.error, { contract: calls[index]?.to, account }) as AnyError),
        gas: result.gasUsed,
      })),
    ),
  );

/** Fallback for RPCs without `eth_simulateV1`: each call alone against current state. */
const simulateEach = (
  client: Client,
  account: Address | undefined,
  calls: readonly Plan.Call[],
): Effect.Effect<readonly CallOutcome[]> =>
  Effect.forEach(calls, (item) =>
    fromPromise(
      () =>
        call(client.publicClient, {
          to: item.to,
          data: item.data,
          value: item.value,
          ...(account === undefined ? {} : { account }),
        }),
      { contract: item.to, account },
    ).pipe(
      Effect.match({
        onFailure: (error): CallOutcome => ({ error, gas: undefined }),
        onSuccess: (): CallOutcome => ({ error: undefined, gas: undefined }),
      }),
    ),
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
  return steps.map((step) => {
    const own = outcomes.slice(offset, offset + step.calls.length);
    offset += step.calls.length;
    const error = own.find((outcome) => outcome.error !== undefined)?.error;
    return error === undefined ? { id: step.id, ok: true } : { id: step.id, ok: false, error };
  });
};

/** Simulates one step against current state, its calls in order. */
export const simulateStep = (
  client: Client,
  step: Plan.Step,
  account: Address | undefined,
): Effect.Effect<Plan.Simulation["steps"][number]> =>
  simulateCallsInOrder(client, account, step.calls).pipe(
    Effect.map((outcomes) => stepResults([step], outcomes)[0] as Plan.Simulation["steps"][number]),
  );

/** Simulates every simulatable step in order, each seeing the effects of the ones before. */
export const simulatePlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.fn.Return<Plan.Simulation, never> {
  const steps = simulatableSteps(plan);
  const outcomes = yield* simulateCallsInOrder(
    client,
    account,
    steps.flatMap((step) => step.calls),
  );
  const results = stepResults(steps, outcomes);

  return { ok: results.every((step) => step.ok), plan, steps: results };
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
  const calls = simulatableSteps(plan).flatMap((step) => step.calls);
  const simulated = yield* simulateSequence(client, account, calls).pipe(
    Effect.map((outcomes) =>
      outcomes.every((outcome) => outcome.gas !== undefined) ? outcomes : undefined,
    ),
    Effect.orElseSucceed(() => undefined),
  );
  const failed = simulated?.find((outcome) => outcome.error !== undefined)?.error;
  if (failed !== undefined) return yield* Effect.fail(failed);

  const gas =
    simulated?.map((outcome) => outcome.gas ?? 0n) ??
    (yield* Effect.forEach(calls, (item) =>
      fromPromise(
        () =>
          viemEstimateGas(client.publicClient, {
            to: item.to,
            data: item.data,
            value: item.value,
            ...(account === undefined ? {} : { account }),
          }),
        { contract: item.to, account },
      ),
    ));

  return {
    plan,
    gas: gas.reduce((total, value) => total + withHeadroom(value), 0n),
    value: plan.calls.reduce((total, item) => total + item.value, 0n),
  };
});
