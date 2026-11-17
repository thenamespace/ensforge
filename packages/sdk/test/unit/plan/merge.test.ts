import { assert, describe, it } from "@effect/vitest";

import { expectThrow } from "@ensforge/test-harness";
import type { Address } from "viem";

import { make } from "#/plan/make";
import { merge } from "#/plan/merge";
import type { Plan } from "#/plan/Plan";

const alice = "0x00000000000000000000000000000000000000a1";
const aliceChecksummed = "0x00000000000000000000000000000000000000A1";
const bob = "0x00000000000000000000000000000000000000b2";
const resolver = "0x00000000000000000000000000000000000000c3";

const call = (data: `0x${string}`, value = 0n): Plan.Call => ({ to: resolver, data, value });

const recordsPlan = make({
  operation: "record.set",
  chainId: 1,
  account: alice,
  steps: [{ id: "set", description: "Set records", calls: [call("0x01"), call("0x02")] }],
  warnings: [{ code: "RESOLVER_NOT_PUBLIC", message: "Custom resolver" }],
});

const registrationPlan = make({
  operation: "registration.register",
  chainId: 1,
  account: aliceChecksummed,
  steps: [
    { id: "commit", description: "Commit", calls: [call("0x03")] },
    {
      id: "register",
      description: "Register",
      calls: [call("0x04", 10n)],
      waitFor: { seconds: 60n },
    },
  ],
  requirements: [{ kind: "balance", amount: 10n }],
  deploys: [{ contract: "resolver", address: resolver }],
});

describe("Plan make", () => {
  it("derives calls from steps in order and defaults the lists", () => {
    assert.deepStrictEqual(registrationPlan.calls, [call("0x03"), call("0x04", 10n)]);
    assert.deepStrictEqual(recordsPlan.requirements, []);
    assert.deepStrictEqual(recordsPlan.deploys, []);
  });

  it("gives every plan a fresh id", () => {
    assert.notStrictEqual(recordsPlan.id, registrationPlan.id);
  });
});

describe("Plan.merge", () => {
  it("concatenates steps, calls, requirements, warnings and deploys in order", () => {
    const merged = merge([recordsPlan, registrationPlan]);

    assert.strictEqual(merged.operation, "record.set+registration.register");
    assert.strictEqual(merged.chainId, 1);
    assert.strictEqual(merged.account, alice);
    assert.deepStrictEqual(
      merged.steps.map((step) => step.id),
      ["0.set", "1.commit", "1.register"],
    );
    assert.deepStrictEqual(merged.steps[2]?.waitFor, { seconds: 60n });
    assert.deepStrictEqual(merged.calls, [...recordsPlan.calls, ...registrationPlan.calls]);
    assert.deepStrictEqual(merged.requirements, registrationPlan.requirements);
    assert.deepStrictEqual(merged.warnings, recordsPlan.warnings);
    assert.deepStrictEqual(merged.deploys, registrationPlan.deploys);
    assert.notInclude([recordsPlan.id, registrationPlan.id], merged.id);
  });

  it("keeps step ids unique when the same plan is merged twice", () => {
    const merged = merge([recordsPlan, recordsPlan]);

    assert.deepStrictEqual(
      merged.steps.map((step) => step.id),
      ["0.set", "1.set"],
    );
  });

  it("does not modify the input plans", () => {
    merge([recordsPlan, registrationPlan]);

    assert.strictEqual(recordsPlan.steps[0]?.id, "set");
  });

  it("accepts plans without an account", () => {
    const anonymous = { ...recordsPlan, account: undefined };

    assert.isUndefined(merge([anonymous, anonymous]).account);
  });

  it("rejects plans for different chains", () => {
    expectThrow(() => merge([recordsPlan, { ...registrationPlan, chainId: 11155111 }]), {
      _tag: "PlanError",
      code: "PLAN_CHAIN_MISMATCH",
    });
  });

  it.each<{ readonly label: string; readonly account: Address | undefined }>([
    { label: "another account", account: bob },
    { label: "no account", account: undefined },
  ])("rejects a plan for $label", ({ account }) => {
    expectThrow(() => merge([recordsPlan, { ...registrationPlan, account }]), {
      _tag: "PlanError",
      code: "PLAN_ACCOUNT_MISMATCH",
    });
  });
});
