import { assert, describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";

// Paths key caches (React atoms, SSR state), so each must match its action and be unique.

const writeMethods = ["prepare", "simulate", "estimateGas"] as const;

type Named = { readonly path?: unknown } & Partial<Record<(typeof writeMethods)[number], unknown>>;

const pathsOf = (actions: Record<string, unknown>) => {
  const paths: { expected: string; actual: unknown }[] = [];
  for (const [domain, group] of Object.entries(actions)) {
    if (domain === "batch") continue;
    for (const [name, action] of Object.entries(group as Record<string, Named>)) {
      paths.push({ expected: `${domain}.${name}`, actual: action.path });
      for (const method of writeMethods) {
        const methodAction = action[method] as Named | undefined;
        if (methodAction !== undefined)
          paths.push({ expected: `${domain}.${name}.${method}`, actual: methodAction.path });
      }
    }
  }
  return paths;
};

describe("action paths", () => {
  it.each([
    ["Promise", Actions],
    ["Effect", EffectActions],
  ] as const)("every %s action and write method is named by its path", (_, actions) => {
    const paths = pathsOf(actions as unknown as Record<string, unknown>);

    assert.deepStrictEqual(
      paths.filter(({ expected, actual }) => expected !== actual),
      [],
    );
    assert.strictEqual(new Set(paths.map(({ actual }) => actual)).size, paths.length);
    assert.isAbove(paths.length, 124);
  });
});
