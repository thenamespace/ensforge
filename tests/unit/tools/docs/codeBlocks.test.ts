/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import { assert, describe, it } from "@effect/vitest";

import { blocksOf, filesOf } from "@ensforge/tools/internal/docs/codeBlocks";

describe("filesOf", () => {
  it("drops twoslash lines and splits files on @filename", () => {
    const files = filesOf(
      [
        "// @filename: ens.ts",
        "export const ens = 1;",
        "// @filename: main.ts",
        "// @types: node",
        "// ---cut---",
        'import { ens } from "./ens";',
        "const x = ens;",
        "//    ^?",
      ].join("\n"),
      "block.ts",
    );

    assert.deepStrictEqual(files, [
      { name: "ens.ts", code: "export const ens = 1;" },
      { name: "main.ts", code: 'import { ens } from "./ens";\nconst x = ens;' },
    ]);
  });
});

describe("blocksOf", () => {
  it("collects ts and tsx blocks, honouring no-check, noCheck and @noErrors", () => {
    const body = [
      '```ts twoslash title="a.ts"',
      "const a = 1;",
      "```",
      "```sh",
      "pnpm add x",
      "```",
      "```ts no-check",
      "const before = old();",
      "```",
      "```tsx noCheck",
      "<Old />",
      "```",
      "```ts",
      "// @noErrors",
      "broken(",
      "```",
      "```tsx",
      "<Profile />",
      "```",
    ].join("\n");

    assert.deepStrictEqual(
      blocksOf(body).map((block) => [block.line, block.extension]),
      [
        [1, "ts"],
        [17, "tsx"],
      ],
    );
  });

  it("removes the indentation of fences nested in lists", () => {
    const [block] = blocksOf("- item\n\n  ```ts\n  const a = 1;\n    const b = 2;\n  ```");

    assert.strictEqual(block?.files[0]?.code, "const a = 1;\n  const b = 2;");
  });
});
