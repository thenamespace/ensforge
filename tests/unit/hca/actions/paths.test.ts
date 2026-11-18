import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Predicate, Record as Rec } from "effect";

import { Actions } from "@ensforge/hca";
import { Actions as EffectActions } from "@ensforge/hca/effect";

const writeMethods = ["prepare", "simulate", "estimateGas"] as const;

const entriesOf = (tree: unknown) => (Predicate.isObject(tree) ? Rec.toEntries(tree) : []);

// An action is a function carrying `path` and, for writes, the `prepare`/`simulate`/`estimateGas` methods.
const propertyOf = (action: unknown, key: string): unknown =>
  Predicate.isObjectKeyword(action) ? Reflect.get(action, key) : undefined;

// Paths key caches (React atoms, SSR state), so each must match its action and be unique.
describe("action paths", () => {
  it.each([
    ["Promise", Actions],
    ["Effect", EffectActions],
  ] as const)("every %s action and write method is named by its path", (_, actions) => {
    const paths = Arr.flatMap(entriesOf(actions), ([domain, group]) =>
      Arr.flatMap(entriesOf(group), ([name, action]) => [
        { expected: `${domain}.${name}`, actual: propertyOf(action, "path") },
        ...Arr.flatMap(writeMethods, (method) => {
          const methodAction = propertyOf(action, method);
          return methodAction === undefined
            ? []
            : [
                {
                  expected: `${domain}.${name}.${method}`,
                  actual: propertyOf(methodAction, "path"),
                },
              ];
        }),
      ]),
    );

    assert.deepStrictEqual(
      Arr.filter(paths, ({ expected, actual }) => expected !== actual),
      [],
    );
    assert.strictEqual(new Set(Arr.map(paths, ({ actual }) => actual)).size, paths.length);
    assert.isAbove(paths.length, 20);
  });
});
