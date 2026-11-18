import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { Actions } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";

import { actionsOf, propertyOf } from "./action-tree";

// Paths key caches (React atoms, SSR state), so each must match its action and be unique.

const writeMethods = ["prepare", "simulate", "estimateGas"] as const;

describe("action paths", () => {
  it.each([
    ["Promise", Actions],
    ["Effect", EffectActions],
  ] as const)("every %s action and write method is named by its path", (_, actions) => {
    const paths = Arr.flatMap(actionsOf(actions), ({ path, action }) => [
      { expected: path, actual: propertyOf(action, "path") },
      ...Arr.flatMap(writeMethods, (method) => {
        const methodAction = propertyOf(action, method);
        return methodAction === undefined
          ? []
          : [{ expected: `${path}.${method}`, actual: propertyOf(methodAction, "path") }];
      }),
    ]);

    assert.deepStrictEqual(
      Arr.filter(paths, ({ expected, actual }) => expected !== actual),
      [],
    );
    assert.strictEqual(new Set(Arr.map(paths, ({ actual }) => actual)).size, paths.length);
    assert.isAbove(paths.length, 124);
  });
});
