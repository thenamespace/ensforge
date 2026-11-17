import { assert, describe, it } from "@effect/vitest";

import { Abis } from "@ensforge/contracts";
import { encodeErrorResult, RawContractError, UserRejectedRequestError } from "viem";

import { NameStateError } from "#/errors/classes/index";
import { fromCause } from "#/errors/translate/fromCause";

describe("fromCause", () => {
  it("returns an ensforge error as the same instance, adding missing context", () => {
    const original = new NameStateError({ code: "NAME_EXPIRED", context: { name: "a.eth" } });
    const error = fromCause(original, { name: "b.eth", operation: "name.renew" });

    assert.strictEqual(error, original);
    assert.deepStrictEqual(error.context, { name: "a.eth", operation: "name.renew" });
  });

  it("translates viem errors and adds the context", () => {
    const cause = new UserRejectedRequestError(new Error("no"));
    const error = fromCause(cause, { operation: "record.set" });

    assert.strictEqual(error.code, "USER_REJECTED");
    assert.strictEqual(error.cause, cause);
    assert.strictEqual(error.context.operation, "record.set");
  });

  it("unwraps a ResolutionError revert to its inner cause", () => {
    const inner = encodeErrorResult({
      abi: Abis.shared.errors,
      errorName: "LabelExpired",
      args: [1n],
    });
    const data = encodeErrorResult({
      abi: Abis.shared.errors,
      errorName: "ResolutionError",
      args: ["0x00000000000000000000000000000000000000E2", inner],
    });

    assert.strictEqual(fromCause(new RawContractError({ data })).code, "NAME_EXPIRED");
  });

  it.each([new Error("boom"), "boom", 42, null, undefined])(
    "wraps %j as InternalError UNEXPECTED with the original as cause",
    (cause) => {
      const error = fromCause(cause, { operation: "x.y" });

      assert.strictEqual(error._tag, "InternalError");
      assert.strictEqual(error.code, "UNEXPECTED");
      assert.strictEqual(error.cause, cause);
      assert.deepStrictEqual(error.context, { operation: "x.y" });
    },
  );
});
