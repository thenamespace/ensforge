import { assert, describe, it } from "@effect/vitest";

import {
  NameStateError,
  NetworkError,
  UserRejectedError,
} from "@ensforge/sdk/internal/errors/classes/index";
import { describe as describeError } from "@ensforge/sdk/internal/errors/describe/describe";

import { codes, errorsByCode, retryableCodes } from "../codes";

describe("Errors.describe copy", () => {
  it.each(codes)("%s has a title and message", (code) => {
    const error = errorsByCode[code]();
    const description = describeError(error);

    assert.isAbove(description.title.length, 0);
    assert.isAbove(description.message.length, 0);
    assert.strictEqual(description.code, code);
    assert.strictEqual(description.retryable, retryableCodes.has(code));
    const info = ["UserRejectedError", "NameStateError", "NotFoundError", "CommitmentError"];
    assert.strictEqual(
      description.severity,
      info.includes(error._tag) ? "info" : retryableCodes.has(code) ? "warning" : "error",
    );
  });

  it.each(codes)("%s copy never leaks the developer message", (code) => {
    const error = errorsByCode[code]();
    const description = describeError(error);

    assert.notInclude(description.message, "Code:");
    assert.notInclude(description.message, "0x");
  });

  it("names the context name when known", () => {
    const description = describeError(
      new NameStateError({ code: "NAME_EXPIRED", context: { name: "nick.eth" } }),
    );

    assert.strictEqual(description.message, "nick.eth has expired.");
    assert.strictEqual(
      describeError(new NameStateError({ code: "NAME_EXPIRED" })).message,
      "This name has expired.",
    );
  });
});

describe("Errors.describe severity", () => {
  it.each([
    { error: new UserRejectedError({ code: "USER_REJECTED" }), severity: "info" },
    { error: new NetworkError({ code: "RPC_TIMEOUT" }), severity: "warning" },
    { error: errorsByCode.INVALID_NAME(), severity: "error" },
  ] as const)("$error.code has severity $severity", ({ error, severity }) => {
    assert.strictEqual(describeError(error).severity, severity);
  });
});

describe("Errors.describe overrides", () => {
  it("replaces fields per code and falls back to English copy", () => {
    const description = describeError(
      new NameStateError({ code: "NAME_NOT_AVAILABLE", context: { name: "nick.eth" } }),
      { messages: { NAME_NOT_AVAILABLE: (error) => ({ title: `No: ${error.context.name}` }) } },
    );

    assert.deepStrictEqual(description, {
      title: "No: nick.eth",
      message: "nick.eth is already registered.",
      action: "Try a different name.",
      code: "NAME_NOT_AVAILABLE",
      retryable: false,
      severity: "info",
    });
  });

  it("ignores overrides for other codes", () => {
    const description = describeError(new NameStateError({ code: "NAME_EXPIRED" }), {
      messages: { NAME_NOT_AVAILABLE: () => ({ title: "unused" }) },
    });

    assert.strictEqual(description.title, "Name expired");
  });
});

describe("Errors.describe on foreign values", () => {
  it.each([new Error("boom"), "boom", undefined, { status: 500 }])(
    "describes %j as UNEXPECTED",
    (value) => {
      const description = describeError(value);

      assert.strictEqual(description.code, "UNEXPECTED");
      assert.strictEqual(description.title, "Something went wrong");
      assert.strictEqual(description.severity, "error");
    },
  );

  it("translates viem-shaped errors first", () => {
    const rejected = Object.assign(new Error("denied"), { code: 4001 });

    assert.strictEqual(describeError(rejected).code, "USER_REJECTED");
  });
});
