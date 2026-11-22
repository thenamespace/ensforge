import { assert, describe, it } from "@effect/vitest";
import { Record as Rec } from "effect";

import { HcaError } from "@ensforge/hca";
import { Errors } from "@ensforge/sdk";

// The mapped type rejects this table when a code is added to or removed from `HcaError`.
const everyCode: { readonly [code in HcaError.Code]: true } = {
  HCA_UNAVAILABLE: true,
  HCA_NOT_VERIFIED: true,
  HCA_EXECUTOR_UNSUPPORTED: true,
  HCA_ACTION_NOT_ALLOWED: true,
  HCA_SESSION_INVALID: true,
  HCA_BUNDLER_REJECTED: true,
  HCA_PAYMASTER_REJECTED: true,
  HCA_EXECUTION_FAILED: true,
  HCA_EXECUTION_TIMEOUT: true,
  HCA_UPGRADE_NOT_ALLOWED: true,
  HCA_SDK_UNSUPPORTED: true,
  HCA_ROUTE_REJECTED: true,
};

describe("Errors.describe for HcaError", () => {
  it.each(Rec.keys(everyCode))("%s has its own copy", (code) => {
    const description = Errors.describe(new HcaError({ code }));

    assert.notStrictEqual(description.title, "Something went wrong");
    assert.isAbove(description.message.length, 0);
    assert.notInclude(description.message, "HCA");
    assert.strictEqual(description.code, code);
  });

  it("marks a retryable code as a warning", () => {
    const description = Errors.describe(new HcaError({ code: "HCA_BUNDLER_REJECTED" }));

    assert.isTrue(description.retryable);
    assert.strictEqual(description.severity, "warning");
  });

  it("takes overrides for HCA codes", () => {
    const description = Errors.describe<Errors.AnyError | HcaError>(
      new HcaError({ code: "HCA_SESSION_INVALID" }),
      { messages: { HCA_SESSION_INVALID: (error) => ({ title: `Sesión: ${error.code}` }) } },
    );

    assert.deepStrictEqual(description, {
      title: "Sesión: HCA_SESSION_INVALID",
      message: "Your session has expired or was revoked.",
      action: "Start a new session.",
      code: "HCA_SESSION_INVALID",
      retryable: false,
      severity: "error",
    });
  });
});
