import { assert, describe, it } from "@effect/vitest";

import { NameStateError, UnauthorizedError } from "@ensforge/sdk/internal/errors/classes/index";
import { hasCode, isEnsforgeError } from "@ensforge/sdk/internal/errors/guards";

describe("isEnsforgeError", () => {
  it("accepts ensforge errors", () => {
    assert.isTrue(isEnsforgeError(new NameStateError({ code: "NAME_EXPIRED" })));
  });

  it("accepts a branded error from another copy of the package", () => {
    assert.isTrue(isEnsforgeError({ "~ensforge/error": true, code: "NOT_OWNER" }));
  });

  it.each([
    null,
    undefined,
    "NOT_OWNER",
    42,
    new Error("plain"),
    { _tag: "NameStateError", code: "NAME_EXPIRED" },
    { "~ensforge/error": "true" },
  ])("rejects %j", (value) => {
    assert.isFalse(isEnsforgeError(value));
  });
});

describe("hasCode", () => {
  const isAvailabilityError = hasCode("NAME_NOT_AVAILABLE", "NAME_RESERVED");

  it("matches errors with one of the codes", () => {
    assert.isTrue(isAvailabilityError(new NameStateError({ code: "NAME_RESERVED" })));
    assert.isTrue(isAvailabilityError(new NameStateError({ code: "NAME_NOT_AVAILABLE" })));
  });

  it("rejects other codes and non-ensforge values", () => {
    assert.isFalse(isAvailabilityError(new NameStateError({ code: "NAME_EXPIRED" })));
    assert.isFalse(isAvailabilityError(new UnauthorizedError({ code: "NOT_OWNER" })));
    assert.isFalse(isAvailabilityError({ code: "NAME_RESERVED" }));
    assert.isFalse(isAvailabilityError(null));
  });

  it("matches nothing without codes", () => {
    assert.isFalse(hasCode()(new NameStateError({ code: "NAME_RESERVED" })));
  });
});
