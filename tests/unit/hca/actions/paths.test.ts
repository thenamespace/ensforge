import { assert, describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/hca";
import { Actions as EffectActions } from "@ensforge/hca/effect";

// Paths key caches (React atoms, SSR state), so each must match its action and be unique.
describe("action paths", () => {
  it.each([
    ["Promise", Actions],
    ["Effect", EffectActions],
  ] as const)("every %s action and write method is named by its path", (_, actions) => {
    const writeMethods = ["prepare", "simulate", "estimateGas"] as const;
    type Named = { readonly path?: unknown } & Partial<
      Record<(typeof writeMethods)[number], { readonly path?: unknown }>
    >;

    const paths: { expected: string; actual: unknown }[] = [];
    for (const [domain, group] of Object.entries(actions)) {
      if (domain === "batch") continue;
      for (const [name, action] of Object.entries(group as Record<string, Named>)) {
        paths.push({ expected: `${domain}.${name}`, actual: action.path });
        for (const method of writeMethods) {
          const methodAction = action[method];
          if (methodAction !== undefined)
            paths.push({ expected: `${domain}.${name}.${method}`, actual: methodAction.path });
        }
      }
    }

    assert.deepStrictEqual(
      paths.filter(({ expected, actual }) => expected !== actual),
      [],
    );
    assert.strictEqual(new Set(paths.map(({ actual }) => actual)).size, paths.length);
    assert.isAbove(paths.length, 20);
  });
});
