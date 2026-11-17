import { assert, describe, it } from "@effect/vitest";

import type { Plan } from "@ensforge/sdk/internal/plan/Plan";
import { deserialize, deserializeRecord, serialize } from "@ensforge/sdk/internal/plan/serialize";
import { expectThrow } from "@ensforge/test-harness";

import { plan } from "./arbitraries";

const planInvalid = { _tag: "PlanError", code: "PLAN_INVALID" };

const minimal: Plan = {
  id: "plan-1",
  operation: "record.set",
  chainId: 1,
  account: "0x00000000000000000000000000000000000000A1",
  steps: [],
  calls: [],
  requirements: [],
  warnings: [],
  deploys: [],
};

describe("Plan.serialize ⇄ Plan.deserialize", () => {
  it.prop("round-trips plans with bigints, hex and nested steps", [plan], ([value]) => {
    assert.deepStrictEqual(deserialize(serialize(value)), value);
  });

  it("encodes bigints as tagged decimal strings", () => {
    const text = serialize({
      ...minimal,
      requirements: [{ kind: "balance", amount: -(2n ** 200n) }],
    });

    assert.include(text, `{"~bigint":"-${2n ** 200n}"}`);
    assert.strictEqual(deserialize(text).requirements[0]?.amount, -(2n ** 200n));
  });

  it("reads a missing account back as undefined", () => {
    assert.isUndefined(deserialize(serialize({ ...minimal, account: undefined })).account);
  });

  it("round-trips saved plan records", () => {
    const record: Plan.Record = {
      plan: { ...minimal, requirements: [{ kind: "balance", amount: 5n }] },
      status: "pending",
      submitted: { "0.commit": [`0x${"ab".repeat(32)}`] },
      bundles: { "0.commit": "bundle" },
      updatedAt: 1_700_000_000_000,
    };

    assert.deepStrictEqual(deserializeRecord(serialize(record)), record);
  });
});

describe("Plan.deserialize invalid input", () => {
  it.each([
    { label: "malformed JSON", text: "{" },
    { label: "null", text: "null" },
    { label: "an array", text: "[]" },
    { label: "a missing id", text: '{"steps":[]}' },
    { label: "a numeric id", text: '{"id":1,"steps":[]}' },
    { label: "steps that are not a list", text: '{"id":"x","steps":{}}' },
    { label: "a malformed bigint", text: '{"id":"x","steps":[],"chainId":{"~bigint":"1.5"}}' },
  ])("rejects $label with PLAN_INVALID and keeps the cause", ({ text }) => {
    const error = expectThrow(() => deserialize(text), planInvalid) as { cause?: unknown };

    assert.instanceOf(error.cause, Error);
  });
});
