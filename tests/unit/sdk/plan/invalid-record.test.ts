import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import { Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { pad } from "viem";

import { scriptedWallet } from "../write/wallet";

// A saved plan that is not a plan record (written by another version, or edited by hand) fails the
// reading actions with PLAN_INVALID rather than a defect.

const corruptClient = () => {
  const items = new Map([["ensforge:plans", '{"broken":"not a plan record"}']]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  });

  return scriptedWallet({ storage: Plan.localStorage() }).client;
};

describe("plan actions on a corrupt saved plan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.effect("plan.get fails with PLAN_INVALID", () =>
    Effect.gen(function* () {
      const error = yield* expectFailure(Actions.plan.get(corruptClient(), { id: "broken" }), {
        _tag: "PlanError",
        code: "PLAN_INVALID",
      });

      assert.strictEqual(error.context.operation, "plan.get");
    }),
  );

  it.effect("plan.list fails with PLAN_INVALID", () =>
    expectFailure(Actions.plan.list(corruptClient(), {}), {
      _tag: "PlanError",
      code: "PLAN_INVALID",
    }),
  );

  it.effect("plan.reconcile fails with PLAN_INVALID", () =>
    expectFailure(
      Actions.plan.reconcile(corruptClient(), { id: "broken", step: "a", hash: pad("0x42") }),
      { _tag: "PlanError", code: "PLAN_INVALID" },
    ),
  );
});
