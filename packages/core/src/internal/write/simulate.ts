import { Effect } from "effect";

import type { Address } from "viem";
import { call, estimateGas as viemEstimateGas } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { fromPromise } from "../rpc/fromPromise.js";

/**
 * Steps that can run against current state: everything before the first wait. Later steps depend
 * on earlier ones being mined (e.g. register after commit), so they cannot be simulated yet.
 */
export const simulatableSteps = (plan: Plan): readonly Plan.Step[] => {
  const firstWait = plan.steps.findIndex((step) => step.waitFor !== undefined);
  return firstWait === -1 ? plan.steps : plan.steps.slice(0, firstWait);
};

const simulateCall = (client: Client, account: Address | undefined, item: Plan.Call) =>
  fromPromise(
    () =>
      call(client.publicClient, {
        to: item.to,
        data: item.data,
        value: item.value,
        ...(account === undefined ? {} : { account }),
      }),
    { contract: item.to, account },
  );

/** Simulates every call of one step against current state. */
export const simulateStep = (
  client: Client,
  step: Plan.Step,
  account: Address | undefined,
): Effect.Effect<Plan.Simulation["steps"][number]> =>
  Effect.forEach(step.calls, (item) => simulateCall(client, account, item), {
    discard: true,
  }).pipe(
    Effect.match({
      onFailure: (error: AnyError) => ({ id: step.id, ok: false, error }),
      onSuccess: () => ({ id: step.id, ok: true }),
    }),
  );

/** Simulates every simulatable step with `eth_call` and reports each step. */
export const simulatePlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.fn.Return<Plan.Simulation, never> {
  const steps = yield* Effect.forEach(simulatableSteps(plan), (step) =>
    simulateStep(client, step, account),
  );

  return { ok: steps.every((step) => step.ok), plan, steps };
});

/** Sums the gas and ETH of every simulatable call. */
export const estimatePlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  account: Address | undefined,
): Effect.fn.Return<Plan.Estimate, AnyError> {
  const calls = simulatableSteps(plan).flatMap((step) => step.calls);
  const gas = yield* Effect.forEach(calls, (item) =>
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
  );

  return {
    plan,
    gas: gas.reduce((total, value) => total + value, 0n),
    value: plan.calls.reduce((total, item) => total + item.value, 0n),
  };
});
