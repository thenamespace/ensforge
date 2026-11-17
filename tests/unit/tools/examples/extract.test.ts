import { assert, describe, it } from "@effect/vitest";

import { examplesOf, toModule } from "@ensforge/tools/internal/examples/extract";

describe("examplesOf", () => {
  it("collects ts and tsx fences from doc comments, without the comment stars", () => {
    const source = [
      "/**",
      " * Reads a record.",
      " *",
      " * ```ts",
      " * const text = await ens.record.getText({ name })",
      " *",
      " * console.log(text)",
      " * ```",
      " *",
      " * ```sh",
      " * pnpm add @ensforge/sdk",
      " * ```",
      " */",
      "// ```ts outside a doc comment is ignored",
      "/**",
      " * ```tsx",
      " * <Profile />",
      " * ```",
      " */",
    ].join("\n");

    assert.deepStrictEqual(examplesOf(source), [
      {
        code: "const text = await ens.record.getText({ name })\n\nconsole.log(text)",
        extension: "ts",
      },
      { code: "<Profile />", extension: "tsx" },
    ]);
  });
});

describe("toModule", () => {
  it("hoists imports, including multi-line ones, and wraps the rest in an async generator", () => {
    const example = [
      'import "./polyfill"',
      "import {",
      "  Actions,",
      "  Ensforge,",
      '} from "@ensforge/sdk"',
      "",
      "export const ens = Ensforge.create({ publicClient })",
      "export default function App() {}",
    ].join("\n");

    assert.strictEqual(
      toModule(example),
      [
        'import "./polyfill"',
        "import {",
        "  Actions,",
        "  Ensforge,",
        '} from "@ensforge/sdk"',
        "",
        "export async function* example() {",
        "",
        "const ens = Ensforge.create({ publicClient })",
        "function App() {}",
        "}",
        "",
      ].join("\n"),
    );
  });
});
