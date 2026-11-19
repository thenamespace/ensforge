import { assert, describe, it } from "@effect/vitest";

import { overBudget } from "@ensforge/tools/internal/budgets";

describe("overBudget", () => {
  it("allows 5% growth and reports growth beyond it or a missing budget", () => {
    const problems = overBudget(
      [
        ["within", 105],
        ["over", 106],
        ["shrunk", 50],
        ["new", 1],
      ],
      { within: 100, over: 100, shrunk: 100 },
      "B gzip",
    );

    assert.deepStrictEqual(problems, [
      "over: 106 B gzip (budget 100 B gzip)",
      "new: 1 B gzip (budget none B gzip)",
    ]);
  });
});
