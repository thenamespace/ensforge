import { assert, describe, it } from "@effect/vitest";

import { expectThrow } from "@ensforge/test-harness";

import * as Duration from "#/utils/Duration";

const invalidDuration = { _tag: "InvalidInputError", code: "INVALID_DURATION" };

describe("Duration", () => {
  it.each([
    [0, 0n],
    [1, 86_400n],
    [30n, 2_592_000n],
    [365, 31_536_000n],
  ] as const)("days(%s) is %s seconds", (n, seconds) => {
    assert.strictEqual(Duration.days(n), seconds);
  });

  it.each([
    [0, 0n],
    [1, 31_536_000n],
    [2n, 63_072_000n],
    [10n ** 30n, 31_536_000n * 10n ** 30n],
  ] as const)("years(%s) is %s seconds", (n, seconds) => {
    assert.strictEqual(Duration.years(n), seconds);
  });

  it.each([-1, -1n, 1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("rejects %s", (n) => {
    expectThrow(() => Duration.days(n), invalidDuration);
    expectThrow(() => Duration.years(n), invalidDuration);
  });
});
